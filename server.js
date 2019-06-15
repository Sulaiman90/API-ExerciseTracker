const express = require('express')
const app = express()
const bodyParser = require('body-parser')
var shortid = require("shortid");
var moment = require("moment");

const cors = require('cors')

const mongoose = require('mongoose')

const dbUrl = 'mongodb://admin:admin@cluster0-shard-00-00-xnxro.mongodb.net:27017,cluster0-shard-00-01-xnxro.mongodb.net:27017,cluster0-shard-00-02-xnxro.mongodb.net:27017/test?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(dbUrl,function(err){
  // Log an error if one occurs
  if(err){
    console.log('Unable to connect to MongoDB',err);
  }
  else {
    console.log('Connected to MongoDB');
  }
});

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

var userSchema = new mongoose.Schema({
    name: {
      type: String,
      unique: true
    },
    _id: String,
    exercises:[{
       "description":{
         type: String,
         required: true
       },
       "duration":{
          type: Number,
          required: true,
       },
       "date": {
         type: Date,
         default: Date.now()
       }
    }]
});

const User = mongoose.model('User',userSchema);

// add user
app.post("/api/exercise/new-user", function (req, res) {
  const username = req.body.username;
  
  if(username === ''){
     return res.status(400).send('Path `username` is required.');
  }
  
  //console.log('username',username);
  
  shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$-');
  
  const userId = shortid.generate();
  
  let user = new User({
        name: username,
        _id: userId
    });
  
  user.save(function(err,doc){
     if(err){
       console.log('err',err);
       return res.status(500).send('username already taken')
     }
    console.log('doc',doc);
    res.status(200).send({"username":doc.name,"_id":doc._id});
  });
});

//get all users
app.get("/api/exercise/users", function (req, res) {

  User.find().exec((err,doc)=> {
      if(err){
        console.log('error in getting users' +err);
         return res.status(500).send("Error in getting users");
      }
      if(doc.length === 0){
         return res.status(404).send("No users exist");
      }
      const users = doc.map(doc => { 
        return {
            _id: doc._id,
            username: doc.name
        }
      })
      
      res.status(200).send(users);
  })
  
});

// add exercise
app.post("/api/exercise/add", function (req, res) {
  const userId = req.body.userId;
  const description = req.body.description;
  const duration = req.body.duration;
  const givenDate = req.body.date;
  let date;
  
   if(givenDate !== ''){
      let validDate = false;
      date = new Date(givenDate);
      console.log('givenDate ',givenDate, date);

      if(date instanceof Date && !isNaN(date)){
         validDate = true;
      }
     
      if(!validDate){
        return res.status(400).json({"error" : "Invalid Date"});
      }
   }
   else {
     date = Date.now();
   }
  
   const record = {
    description: description,
    duration: duration,
    date: date
  }
   
   console.log('record',record);

  const projection = {
    exercises: {'$push': record }
  }
  
  User.findOne({_id: userId}).exec((err, doc) => {
    if(err){
       console.log('err',err);
       return res.status(400).send(err);
     }
    if(doc === null){
       return res.status(400).send('unknown id');
    }
    //console.log('doc',doc);
    
    doc.exercises = doc.exercises.concat([record]);
    
    doc.save(function(err,doc) {
        if (err) {
           console.log('err',err);
            if (err.name == 'ValidationError') {
                for (var field in err.errors) {
                  console.log('error message',err.errors[field].message); 
                  return res.status(400).send(err.errors[field].message);
                }
            }
          return res.status(400).send(err.errors);
        }
        console.log('user',doc);
        const userObj = { 
          'username': doc.name,
          "description":description,
          "duration":duration,
          '_id':doc.id,
          "date": moment(date).format("ddd MMM D YYYY")
        }
        res.status(200).send(userObj);
    })
  })
});

// get exercise log of users
app.get("/api/exercise/log", function (req, res) {
  
  //{"_id":"H19zNBfyH","username":"sulai456","count":1,"log":[{"description":"as","duration":23,"date":"Sat Jan 05 2019"}]}

  const givenfromDate = req.query.from;
  let fromdate;
  const givenToDate = req.query.to;
  let todate;
  
  const limit = req.query.limit;
  
  console.log('userId',req.query.userId);
  
  if(req.query.userId === undefined){
      return res.status(404).send("UserId is required");
   }

  let pipelines = [
     {
        '$match': {
            '_id': req.query.userId
        }
     },
     {
        '$unwind': {
            'path': '$exercises'
        }
     },
     {
        '$sort': {
            'exercises.date': 1
         }
     }
   ]
  
    if(givenfromDate !== ''){
       fromdate = new Date(givenfromDate);
      
      //console.log('fromdate',givenfromDate,fromdate);

       if(fromdate instanceof Date && !isNaN(fromdate)){
         //console.log('valid from date');
           pipelines.push({
             '$match': {
                'exercises.date': {
                    '$gte': fromdate
                }
             }
           });
       }
      else {
        console.log('invalid from date');
      }
    }
  
   if(givenToDate !== ''){
     todate = new Date(givenToDate);
     
     console.log('todate',givenToDate,todate);
     
     if(todate instanceof Date && !isNaN(todate)){
       const endTimeToDate = moment(todate).add(23, 'hours').add(59,'minutes');
       
         pipelines.push({
             '$match': {
                'exercises.date': {
                    '$lte': new Date(endTimeToDate)
                }
             }
         });
     }
   }
  
   if(limit !== undefined){
      pipelines.push({
          '$limit': parseInt(limit)
      });
   }
  
  pipelines.push({
        '$group': {
            '_id': '$_id', 
            'exercises': {
                '$push': '$exercises'
            }, 
            'name': {
                '$first': '$name'
            }
        }
    });
  
  console.log('pipelines',pipelines);
  
  User.aggregate(pipelines).exec((err,data)=> {
      if(err){
        console.log('error in getting user' +err);
         return res.status(500).send("Error in getting user");
      }
      if(data === null || data.length === 0){
         return res.status(404).send("Not found");
      }
    
      const doc = data[0];
    
      const user = {
        _id: doc._id,
        username: doc.name,
        count: doc.exercises.length,
        log: doc.exercises.map(log => {
          return {
            description: log.description,
            duration: log.duration,
            date: moment(log.date).format("ddd MMM DD YYYY")
          }
        })
      }
      res.status(200).send(user);
  })
});

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'});
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
