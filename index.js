const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config({});
const app = express();
const btoa = require("btoa");
const sqlite = require("sqlite3").verbose();
const PORT = process.env.PORT||3000
let db = new sqlite.Database("./local.db", (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log("Connected to the local database.");
});

async function createTable() {
  return new Promise(function (resolve, reject) {
    db.run(
      "CREATE TABLE IF NOT EXISTS tweets (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, text TEXT, status TEXT)",
      (err) => {
        if (err) {
          console.error(err.message);
          reject(err);
        }
        console.log("Table created successfully or already exists.");
        resolve();
      }
    );
  });
}

async function fetchFirstDraftTweet() {
  return new Promise(function (resolve, reject) {
    let sql = `SELECT * FROM tweets WHERE status = "draft" LIMIT 1`;

    db.get(sql, (err, row) => {
      if (err) {
        console.error(err.message);
        reject(err);
      }
      console.log(row);
      resolve(row);
    });
  });
}

app.use(bodyParser.json());

let tweets = [];

const cron = require("node-cron");
const { groupCollapsed } = require("console");

cron.schedule(process.env.cron_tweets_load||"0 0 * * *", () => {
  readLocalTweets();
});

cron.schedule(process.env.cron_tweet_send||"0 */2 * * *", () => {
  sendOneTweet();
});

async function sendOneTweet() {
  const axios = require("axios");

  
  let draftTweet = await fetchFirstDraftTweet();

  if(!draftTweet){
    console.log('No draft tweet found')
    return false
  }

  //send post request to local API route
  axios
    .post(`http://localhost:${PORT}/callback`, {
      item: {
        ...draftTweet,
      },
    })
    .then((res) => {
      //handle success
      console.log(res.data);
      if (res.data.item.id) {
        updateTweetPublished(res.data.item.id);
      }
    })
    .catch((err) => {
      //handle error
      console.log(err);
    });
}
async function updateTweetPublished(id) {
  return new Promise(function (resolve, reject) {
    let sql = `UPDATE tweets SET status = "published" WHERE id = ?`;
    let values = [id];

    db.run(sql, values, function (err) {
      if (err) {
        console.error(err.message);
        reject(err);
      }
      console.log(`Row updateTweetPublished with rowid ${this.lastID}`);
      resolve();
    });
  });
}

function genSha(text) {
  const crypto = require("crypto");

  return crypto.createHash("sha256").update(text).digest("hex");
}

function readLocalTweets() {
  const fs = require("fs");

  fs.readFile(process.env.tweets_file_path, "utf8", (err, data) => {
    if (err) throw err;

    const lines = data.split("\n");
    lines.forEach((line) => {
      // Do something with the line
      console.log({
        line: removeChars(line),
      });

      newTweet = {
        text: removeChars(line),
        code: genSha(line),
        status: "draft",
      };

      if (!tweets.some((tweet) => tweet.code === newTweet.code)) {
        tweets.push(newTweet);
      }
    });
    saveTweets(tweets);
    console.log("Tweets updated", {
      len: tweets.length,
    });
  });
}

async function saveTweets(arr) {
  // Sequential Async Function

  for (let i = 0; i < arr.length; i++) {
    try {
      try{
        await insertTweet(arr[i]);
      }catch(err){
        console.log('Error inserting tweet in db')
      }
    } catch (err) {
      console.error(err);
    }
  }
}

function removeChars(str) {
  if (str.indexOf("/") <= 4) {
    return str.slice(str.indexOf(" ") + 1);
  }
  return str;
}



app.get('/load', (req,res)=>{
  readLocalTweets
  res.json({
    result:"Tweets will be loaded into db",
  })
})

app.get('/send', (req,res)=>{
  sendOneTweet();
  res.json({
    result:"Tweet queued",
  })
})

app.post("/callback", (req, res) => {
  const { item } = req.body;

  console.log({
    body: JSON.stringify(req.body),
  });
  let send = false
  tweet(item)
    .catch((err) => {
      console.error({
        itemCode: item.code,
        route:'/callback',
        err,
      });
      if(send){
        return
      }
      send=true
      res.json({ item: null, err: "Tweet failed" });
    })
    .then(() => {
      console.log({
        itemCode: item.code,
        route:'/callback',
        result:'success'
      })
      if(send){
        return
      }
      send=true
      res.json({ item });
    });
});

createTable().then(() => {
  app.listen(PORT, () => {
    console.log("Server is running on port 3000");
  });
});

function tweet(item) {
  const Twitter = require("twitter");

  let twitterOptions = {
    consumer_key: process.env.api_key,
    consumer_secret: process.env.api_key_secret,
    access_token_key: process.env.access_token,
    access_token_secret: process.env.access_token_secret,
  };

  const client = new Twitter(twitterOptions);
  return new Promise((resolve, reject) => {
    client.post(
      "statuses/update",
      { status: item.text },
      (error, tweet, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(`Tweet sent: ${tweet.text}`);
        }
      }
    );
  });
}

async function insertTweet(item) {
  return new Promise(function (resolve, reject) {
    let sql = `INSERT INTO tweets(code, text, status) VALUES(?,?,?)`;
    let values = [item.code, item.text, item.status];

    db.run(sql, values, function (err) {
      if (err) {
        // Check for "SQLITE_CONSTRAINT" error code
        if (err.errno == 19) {
          console.log("Record already exists, skipping insert...");
          resolve();
        } else {
          console.error(err.message);
          reject(err);
        }
      }
      console.log(`Row inserted with rowid ${this.lastID}`);
      resolve();
    });
  });
}

// Close the database connection
async function closeDb() {
  return new Promise(function (resolve, reject) {
    db.close((err) => {
      if (err) {
        console.error(err.message);
        reject(err);
      }
      console.log("Close the database connection.");
      resolve();
    });
  });
}

process.on("exit", function (code) {
  closeDb();
});
