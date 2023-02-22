const httpServer = require("http").createServer();
const Redis = require("ioredis");
const redisClient = new Redis(6379,"0.0.0.0");
const dotenv = require('dotenv');
dotenv.config();
 
const io = require("socket.io")(httpServer, {
  cors: {
    origin: "http://localhost:8081",
  },
  adapter: require("socket.io-redis")({
    pubClient: redisClient,
    subClient: redisClient.duplicate(),
  }),
});

const { setupWorker } = require("@socket.io/sticky");
const crypto = require("crypto");
const randomId = () => crypto.randomBytes(8).toString("hex");

const { DatabaseSessionStore } = require("./sessionStore");
const sessionStore = new DatabaseSessionStore();

const { DatabaseMessageStore } = require("./messageStore");
const messageStore = new DatabaseMessageStore();

//middleware
io.use(async (socket, next) => {
  const sessionID = socket.handshake.auth.sessionID;


  if (sessionID) {
    const session = await sessionStore.findSession(sessionID);

    if (session) {
      console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>NO Sessionwwww found",session)

      socket.sessionID = sessionID;
      socket.userID = session.userID;
      socket.username = session.username;
      return next();
    }
  }
  const username = socket.handshake.auth.username;
  console.log("username",socket.handshake.auth);
  if (!username) {
    return next(new Error("invalid username"));
  }
  socket.sessionID = randomId();
  socket.userID = randomId();
  socket.username = username;
  next();
});

io.on("connection", async (socket) => {
  console.log(`connected tp Worker ${process.pid} node`);

  // messageStore.findMessagesForUser(socket.userID);
  // persist session
  sessionStore.saveSession(socket.sessionID, {
    userID: socket.userID,
    username: socket.username,
    connected: true,
  });

  // emit session details
  socket.emit("session", {
    sessionID: socket.sessionID,
    userID: socket.userID,
  });

  // join the "userID" room
  socket.join(socket.userID);

  // fetch existing users
  const users = [];
  const [messages, sessions] = await Promise.all([
    messageStore.findMessagesForUser(socket.userID),
    sessionStore.findAllSessions(),
  ]);
  const messagesPerUser = new Map();
  messages.forEach((message) => {
    const { from, to } = message;
    const otherUser = socket.userID === from ? to : from;
    if (messagesPerUser.has(otherUser)) {
      messagesPerUser.get(otherUser).push(message);
    } else {
      messagesPerUser.set(otherUser, [message]);
    }
  });

  sessions.forEach((session) => {
    users.push({
      userID: session.userID,
      username: session.username,
      connected: session.connected,
      messages: messagesPerUser.get(session.userID) || [],
    });
  });
  socket.emit("users", users);

  // notify existing users
  socket.broadcast.emit("user connected", {
    userID: socket.userID,
    username: socket.username,
    connected: true,
    messages: [],
  });

  // forward the private message to the right recipient (and to other tabs of the sender)
  socket.on("private message", ({ content, to }) => {
    const message = {
      content,
      from: socket.userID,
      to,
    };
    socket.to(to).to(socket.userID).emit("private message", message);
    messageStore.saveMessage(message);
  });

  // notify users upon disconnection
  socket.on("disconnect", async () => {
    const matchingSockets = await io.in(socket.userID).allSockets();
    const isDisconnected = matchingSockets.size === 0;
    if (isDisconnected) {
      socket.broadcast.emit("user disconnected", socket.userID);
      sessionStore.saveSession(socket.sessionID, {
        userID: socket.userID,
        username: socket.username,
        connected: false,
      });
    }
  });
});

setupWorker(io);
