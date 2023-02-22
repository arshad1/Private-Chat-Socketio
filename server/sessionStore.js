const Database = require("./database");

/* abstract */ class SessionStore {
  findSession(id) {}
  saveSession(id, session) {}
  findAllSessions() {}
}

class InMemorySessionStore extends SessionStore {
  constructor() {
    super();
    this.sessions = new Map();
  }

  findSession(id) {
    return this.sessions.get(id);
  }

  saveSession(id, session) {
    this.sessions.set(id, session);
  }

  findAllSessions() {
    return [...this.sessions.values()];
  }
}

const SESSION_TTL = 24 * 60 * 60;
const mapSession = ([userID, username, connected]) =>
  userID ? { userID, username, connected: connected === "true" } : undefined;

class RedisSessionStore extends SessionStore {
  constructor(redisClient) {
    super();
    this.redisClient = redisClient;
  }

  findSession(id) {
    return this.redisClient
      .hmget(`session:${id}`, "userID", "username", "connected")
      .then(mapSession);
  }

  saveSession(id, { userID, username, connected }) {
    this.redisClient
      .multi()
      .hset(
        `session:${id}`,
        "userID",
        userID,
        "username",
        username,
        "connected",
        connected
      )
      .expire(`session:${id}`, SESSION_TTL)
      .exec();
  }

  async findAllSessions() {
    const keys = new Set();
    let nextIndex = 0;
    do {
      const [nextIndexAsStr, results] = await this.redisClient.scan(
        nextIndex,
        "MATCH",
        "session:*",
        "COUNT",
        "100"
      );
      nextIndex = parseInt(nextIndexAsStr, 10);
      results.forEach((s) => keys.add(s));
    } while (nextIndex !== 0);
    const commands = [];
    keys.forEach((key) => {
      commands.push(["hmget", key, "userID", "username", "connected"]);
    });
    return this.redisClient
      .multi(commands)
      .exec()
      .then((results) => {
        return results
          .map(([err, session]) => (err ? undefined : mapSession(session)))
          .filter((v) => !!v);
      });
  }
}

class DatabaseSessionStore extends SessionStore {

  constructor() {
    super();
    this.conn = new Database();
  }

  async findSession(id) {
    const conn =await this.conn.connect();

    try{
      const [rows] = await conn.execute('SELECT * FROM `chat_session` where session_id=?', [id]);

      if (rows.length){
        rows[0].userID = rows[0].user_id
        rows[0].connected = rows[0].connected ? true: false
        return rows[0]
      }
      return null
      
    }catch(e){
      console.log(e)
    } finally{ conn.end()}
    
  }

  async saveSession(id, session) {

    const conn = await this.conn.connect();

    try{

      var data =[id, session.userID, session.username,session.connected]
     
      let ses= this.findSession(id)
      if (ses){
        await conn.execute('UPDATE `chat_session` SET   `user_id`=?, `username`=?, `connected`=? where session_id=?  ', [session.userID, session.username,session.connected, id]);

      }else
        await conn.execute('INSERT INTO `chat_session`(`session_id`, `user_id`, `username`, `connected`)  VALUES (?,?,?,?) ', data);

    }catch(e){
      console.log(e)
    } finally{ conn.end()}

  }

  async findAllSessions() {

    const conn =await this.conn.connect();

    try{

      const [rows] = await conn.execute('SELECT * FROM `chat_session`  ', []);
      
      return rows.map((result) => {
        result.userID = result.user_id
        result.connected = result.connected ? true: false
        return result
      })

    }catch(e){
      console.log(e)
    } finally{ conn.end()}
    
  }
}

module.exports = {
  InMemorySessionStore,
  DatabaseSessionStore,
  RedisSessionStore,
};
