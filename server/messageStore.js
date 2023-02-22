const Database = require("./database");


/* abstract */ class MessageStore {
  saveMessage(message) {}
  findMessagesForUser(userID) {}
}

class InMemoryMessageStore extends MessageStore {
  constructor() {
    super();
    this.messages = [];
    
  }

  saveMessage(message) {
    this.messages.push(message);
  }

  findMessagesForUser(userID) {
    return this.messages.filter(
      ({ from, to }) => from === userID || to === userID
    );
  }
}

const CONVERSATION_TTL = 24 * 60 * 60;

class RedisMessageStore extends MessageStore {
  constructor(redisClient) {
    super();
    this.redisClient = redisClient;
   
   
  }

  async saveMessage(message) {
    const value = JSON.stringify(message);
    this.redisClient
      .multi()
      .rpush(`messages:${message.from}`, value)
      .rpush(`messages:${message.to}`, value)
      .expire(`messages:${message.from}`, CONVERSATION_TTL)
      .expire(`messages:${message.to}`, CONVERSATION_TTL)
      .exec();
  }

  async findMessagesForUser(userID) {

    return this.redisClient
      .lrange(`messages:${userID}`, 0, -1)
      .then((results) => {
        console.log(results)
        return results.map((result) => JSON.parse(result));
      });
  }
}


class DatabaseMessageStore extends MessageStore {
  constructor() {
    super();
    this.conn = new Database();
  }

  async saveMessage(message) {
 

    const conn =await this.conn.connect();
    try {
        await conn.execute('INSERT INTO `message`( `content`, `xfrom`, `xto`, `user_id`) VALUES (?,?,?,?) ', [message.content, message.from, message.to,message.from]);
    } finally {
      conn.end();
    }

  
  }

  async findMessagesForUser(userID) {
    const conn =await this.conn.connect();
    try {
      const [rows] = await conn.execute('SELECT * FROM `message` where xfrom=? or  xto=? ', [userID,userID]);

     console.log("findMessagesForUser",rows,userID);
     return rows.map((result) => {
      result.to = result.xto;
      result.from=result.xfrom;
      return result
     });
    }catch(e){
      console.log("error",e)

    }finally {
      conn.end();
    }
 
  }
}

module.exports = {
  InMemoryMessageStore,
  DatabaseMessageStore,
  RedisMessageStore,
};
