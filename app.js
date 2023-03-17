const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const {Server} = require('socket.io');
const path=require('path')
const app = express();
const multer=require('multer')
const cors=require('cors')
const server = http.createServer(app);
const fs = require('fs');
const mysql = require('mysql');




app.use(express.json());
const io = new Server(server,{

  cors: {
      origin: "*"  
  }
});
app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));

 const pool=  mysql.createPool({
    connectionLimit: 5,
    host: 'db.phantom2me.com',
    user: 'phantomerp',
    password: 'RQE>OFGwWJj%',
    database: 'phantomerp',
    connectTimeout: 10000
  });




const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads')
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' +file.originalname)
  }
})

const upload = multer({ storage: storage }).single('file')

io.on('connection', async(socket) => {
    console.log('A new user connected');
    checkForUpdates(); 
    checkForstatus();
    checkForDataUpdates();  
  });
let previousData;
  const checkForstatus = async function () {
    pool.getConnection((err, connection) => {
      connection.query(`SELECT t.id,b.booking_status 
      FROM customer_trip t
       INNER join booking_lorry_receipt blr ON t.lr_no=blr.lr_manual
       INNER JOIN booking b ON blr.bid=b.id
       WHERE t.pickup_datetime>='2023-03-16 00:00:00'
       GROUP BY t.id`, (err, rows) => {
        // Release the connection back to the pool
        connection.release();
  
        if (err) throw err;
      if (previousData !== JSON.stringify(rows)) {
        console.log('Data changed:');
        previousData = JSON.stringify(rows);
        io.emit('message', rows);
      }
      setTimeout(()=>checkForstatus(), 5000);
      });
    });  
   
  };
let lastData;
  const checkForDataUpdates = async function () {
    pool.getConnection((err, connection) => {
      connection.query(`SELECT t.id,t.lr_no,v.vehiclename,c.partyname,t.pickup_datetime,t.expected_trip_duration,MAX(s.active_button) as active,
      h.address as hub,
      (SELECT CONCAT(ca.address1,ct.cityName,', ',st.state_name,', ',ca.postal_code)  
       FROM consigner_address ca 
       INNER JOIN cities ct ON ca.city_id=ct.cityID 
       INNER JOIN states st ON ca.state_id=st.state_id 
       WHERE t.consignor_address_id=ca.id) AS pickup,
      (SELECT CONCAT(ca.address1,ct.cityName,', ',st.state_name,', ',ca.postal_code) 
       FROM consigner_address ca
      INNER JOIN cities ct ON ca.city_id=ct.cityID
        INNER JOIN states st ON ca.state_id=st.state_id 
       WHERE t.consignee_address_id=ca.id) AS delivery
      FROM customer_trip t 
      INNER JOIN vehicle v ON t.vehicle_number=v.id
      INNER JOIN customer c ON t.customer_id=c.id 
      LEFT JOIN customer_trip_status s ON t.id =s.trip_id 
      LEFT JOIN maintenance_type_location h ON t.return_hublocation_id =h.id 
      WHERE t.pickup_datetime>='2023-03-16 00:00:00'
      GROUP BY t.id ORDER BY t.id  DESC;`, (err, rows) => {
        // Release the connection back to the pool
        connection.release();
  
        if (err) throw err;
      if (lastData !== JSON.stringify(rows)) {
        console.log('Data changed2:');
        lastData = JSON.stringify(rows);
        io.emit('newOne', rows);
      }
      setTimeout(()=>checkForDataUpdates(), 5000);
      });
    });  
   
  };
const checkForUpdates = function () {

    const data = fs.readFileSync('data.json');
    let jsonData = JSON.parse(data);
  
    // Loop through each data object and check if the end time has been reached
    for (let i = 0; i < jsonData.length; i++) {
      const endTime = new Date(jsonData[i].endTime);
      if (endTime <= new Date()) {
        io.emit('endTimeReached', jsonData[i]);
        jsonData = jsonData.filter(item => item.id != jsonData[i].id);
  fs.writeFileSync('data.json', JSON.stringify(jsonData));
        // If the end time has been reached, emit a Socket.io event with the data object
        
      }
    }
  
  setTimeout(()=>checkForUpdates(), 3000);
};

app.get('/data',  function (req, res) {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error('Error getting connection from pool:', err);
      return res.status(500).json({ error: 'Failed to get connection from pool' });
    }

    // Use the connection to execute a query
    connection.query(`SELECT t.id,t.lr_no,v.vehiclename,c.partyname,t.pickup_datetime,t.expected_trip_duration,MAX(s.active_button) as active,
    h.address as hub,
    (SELECT CONCAT(ca.address1,ct.cityName,', ',st.state_name,', ',ca.postal_code)  
     FROM consigner_address ca 
     INNER JOIN cities ct ON ca.city_id=ct.cityID 
     INNER JOIN states st ON ca.state_id=st.state_id 
     WHERE t.consignor_address_id=ca.id) AS pickup,
    (SELECT CONCAT(ca.address1,ct.cityName,', ',st.state_name,', ',ca.postal_code) 
     FROM consigner_address ca
    INNER JOIN cities ct ON ca.city_id=ct.cityID
      INNER JOIN states st ON ca.state_id=st.state_id 
     WHERE t.consignee_address_id=ca.id) AS delivery
    FROM customer_trip t 
    INNER JOIN vehicle v ON t.vehicle_number=v.id
    INNER JOIN customer c ON t.customer_id=c.id 
    LEFT JOIN customer_trip_status s ON t.id =s.trip_id 
    LEFT JOIN maintenance_type_location h ON t.return_hublocation_id =h.id 
    WHERE t.pickup_datetime>='2023-03-16 00:00:00'
    GROUP BY t.id ORDER BY t.id  DESC`, (err, rows) => {
      // Release the connection back to the pool
      connection.release();

      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to execute query' });
      }

      // Return the results
      res.json(rows);
    });
  });  
 
});

app.get('/tripstatus',  function (req, res) {
  const pool=  mysql.createPool({
    connectionLimit: 1,
    host: 'db.phantom2me.com',
    user: 'phantomerp',
    password: 'RQE>OFGwWJj%',
    database: 'phantomerp',
    connectTimeout: 10000
  });
  pool.getConnection((err, connection) => {

    connection.query(`SELECT t.id,b.booking_status 
    FROM customer_trip t
     INNER join booking_lorry_receipt blr ON t.lr_no=blr.lr_manual
     INNER JOIN booking b ON blr.bid=b.id
     WHERE t.pickup_datetime>='2023-03-16 00:00:00'
     GROUP BY t.id`, (err, rows) => {
      // Release the connection back to the pool
      connection.release();

      if (err) {
        console.error('Error executing query:', err);
        return res.status(500).json({ error: 'Failed to execute query' });
      }

      // Return the results
      res.json(rows);
    });
  });  
 
});


app.post('/addItem', (req, res) => {
  const data2 = fs.readFileSync('data.json');
  const jsonData = JSON.parse(data2);
  const { id,lr_no,vehiclename,partyname,pickup_datetime,expected_trip_duration,pickup,delivery,hub,booking_status,endTime } = req.body;
  // Add the new item to the JSON data array

  jsonData.push({
    id,lr_no,vehiclename,partyname,pickup_datetime,expected_trip_duration,pickup,delivery,hub,booking_status,
    endTime:endTime,
  });

  // Write the updated data back to the file
  fs.writeFileSync('data.json', JSON.stringify(jsonData));

  // Return the updated data to the React application
  res.json(jsonData);
});

app.post('/completed', (req, res) => {
  const data2 = fs.readFileSync('completed.json');
  const jsonData = JSON.parse(data2);
  const { id,lr_no,vehiclename,partyname,pickup_datetime,expected_trip_duration,pickup,delivery,hub } = req.body;
  // Add the new item to the JSON data array
  jsonData.push({
    id,lr_no,vehiclename,partyname,pickup_datetime,expected_trip_duration,pickup,delivery,hub
  });

  // Write the updated data back to the file
  fs.writeFileSync('completed.json', JSON.stringify(jsonData));

  // Return the updated data to the React application
  res.json(jsonData);
});

app.post('/imagelength', (req, res) => {
  const data2 = fs.readFileSync('history.json');
  const jsonData = JSON.parse(data2);
  const { id } = req.body;
  // Add the new item to the JSON data array
  const finder=jsonData.find(item=>item.id==id) || 0;
    

 if(finder===0)
 res.json(0)
 else
  res.json(finder.history.length);
});


app.get('/getsnoozed', (req, res) => {
  const data2 = fs.readFileSync('data.json');
  const jsonData = JSON.parse(data2);
  res.json(jsonData);
});

app.get('/getcompleted', (req, res) => {
  const data2 = fs.readFileSync('completed.json');
  const jsonData = JSON.parse(data2);
  res.json(jsonData);
});

app.get('/getimages', (req, res) => {
  const data2 = fs.readFileSync('history.json');
  const jsonData = JSON.parse(data2);
  res.json(jsonData);
});




app.post('/upload', (req, res) => {
  upload(req, res, (err) => {
    const {filename}=req.file;
    const id=req.body.id
    const data2 = fs.readFileSync('history.json');
      const jsonData = JSON.parse(data2);
      let a=jsonData.find(obj => obj.id === id)
  if(a){
    a.history=[{filename,date:new Date()},...a.history]
  }
  else
  {jsonData.push({
    id: id,
    history:[{filename,date:new Date()}],
  });}
  fs.writeFileSync('history.json', JSON.stringify(jsonData));
    if (err) {
      res.sendStatus(500);
    }
    res.send(jsonData);
  });
});

app.use(express.static(path.join(__dirname, 'uploads')));

const port = 3002;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});