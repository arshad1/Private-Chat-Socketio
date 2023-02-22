const mysql = require('mysql2/promise');

class Database {
    
    constructor() {
      //  super();
        this.config = {
            host: process.env.DATABASE_HOST,
            user: process.env.DATABASE_USERNAME,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME,
            port: process.env.DATABASE_PORT

        }
        // this.db= this.connect()
      }

   async connect() {
    console.log("trying to connect db" );
        return await mysql.createConnection( this.config )
    }
}


module.exports = Database;
  