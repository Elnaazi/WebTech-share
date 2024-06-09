const express = require("express");
const dotenv = require("dotenv");
var bodyParser=require("body-parser");
var pg=require("pg");
const { render } = require("pug");

// Reading global variables from config file
dotenv.config();

//so that I dont have to have my username, password etc here
const conString=process.env.DB_CON_STRING;
console.log(conString)

//check if the CON_STRING is fefined
if(conString==undefined){  
  console.log("ERROR:enviroment variable DB_CON_STRING not set.");
  //end the node.js application
  process.exit(1);
}

//Configure connection and connect to client
pg.defaults.ssl=false;
var dbClient=new pg.Client(conString);
dbClient.connect();

var urlencodedParser=bodyParser.urlencoded({extended:false});

dbClient.query("SELECT * FROM stations INNER JOIN weathers ON stations.id=weathers.station_id", function (dbError,dbResponse){
    console.log(dbResponse.rows);
  }
);


const PORT = process.env.PORT || 3000;

const app = express();

// Serve static files (required for delivering CSS to client)
app.use(express.static("public"));

// Configure template engine
app.set("views", "views");
app.set("view engine", "pug");

// Route to render Pug template for the home page
app.get("/", (req, res) => {
  res.render("index"); // Renders the "index.pug" 
});


// Route to render Pug template for the dashboard page 
app.get("/dashboard", (req, res) => { 
  dbClient.query("SELECT s.*,w.*FROM (SELECT w.*,ROW_NUMBER() OVER (PARTITION BY w.station_id ORDER BY w.zeitpunkt DESC) AS rn FROM weathers w) w INNER JOIN stations s ON s.id = w.station_id WHERE w.rn = 1", function(dbError, dbResponse){
    if (dbError) {
      console.error("Error executing query", dbError);
      res.status(500).send("Database error");
      return;
    }
    console.log("Dashboard connected to database");
    res.render("dashboard", {stations: dbResponse.rows});
  });
});


// Route to render Pug template for the station page
app.get("/station/:id", function(req, res){
  var stationId = req.params.id; // Get the station ID from the URL parameter
  console.log(`Fetching data for station ID: ${stationId}`); // Log the station ID

  // Query to get data for the specific station
  dbClient.query("SELECT * FROM stations INNER JOIN weathers ON stations.id=weathers.station_id WHERE stations.id = $1 ORDER BY weathers.zeitpunkt DESC", [stationId], function(dbError, dbResponse){
    if (dbError) {
      console.error("Error executing query", dbError);
      res.status(500).send("Database error");
      return;
    }

    var latestWeather=dbResponse.rows[0];
    var allWeathers=dbResponse.rows;
    res.render("station", {latestWeather,allWeathers});
    console.log(latestWeather); // Log the station ID
    console.log(allWeathers);

  });
});


app.listen(PORT, () => {
  console.log(`Weathertop running and listening on port ${PORT}`); // Output in terminal
});


app.post("/dashboard", urlencodedParser, function(req, res){
  var locationName = req.body.Station_name;
  var locationBreitengrad = req.body.Breitengrad_name;
  var locationLängengrad = req.body.Längengrad_name;
  console.log(`Inserting station: ${locationName}, ${locationBreitengrad}, ${locationLängengrad}`);

    // Insert into stations and get the new station ID
    dbClient.query("INSERT INTO stations (location, breitengrad, längengrad) VALUES ($1, $2, $3) RETURNING id",
      [locationName, locationBreitengrad, locationLängengrad], function(dbError, dbResponse) {
        if (dbError) {
          console.error("Error inserting into stations:", dbError);
          res.status(500).send(`Error inserting into stations: ${dbError.message}`);
        } else {
          // Get the new station ID
          stationId = dbResponse.rows[0].id;

          // Insert into weathers table using a JOIN with stations
          dbClient.query(
            "INSERT INTO weathers (station_id) SELECT id FROM stations WHERE id = $1",[stationId],function(dbError, dbResponse) {
              if (dbError) {
                console.error("Error inserting into weathers:", dbError);
                res.status(500).send(`Error inserting into weathers: ${dbError.message}`);
              } else {
                    res.redirect("/dashboard");
                  }
                });
              }
            }
          );
        }
    );

    app.post("/station/:id", urlencodedParser, function(req, res) {
      var wetterValue = req.body.Wetter_value;
      var temperaturValue = req.body.Temperatur_value;
      var windValue = req.body.Windgeschwindigkeit_value;
      var luftdruckValue = req.body.Luftdruck_value;
      var stationId = req.params.id;
    
      console.log("Received POST request for station ID:", stationId);
      console.log(`Inserting weather: ${wetterValue}, ${temperaturValue}, ${windValue}, ${luftdruckValue}, ${stationId}`);
    
      if (!stationId) {
        console.error("Station ID is undefined");
        res.status(400).send("Station ID is required");
        return;
      }
    
      dbClient.query("INSERT INTO weathers (wetter, temperatur, wind, luftdruck, station_id) VALUES ($1, $2, $3, $4, $5)",
      [wetterValue, temperaturValue, windValue, luftdruckValue, stationId], function(dbError, dbResponse) {
        if (dbError) {
          console.error("Error inserting into weathers:", dbError);
          res.status(500).send(`Error inserting into weathers: ${dbError.message}`);
        } else {
          res.redirect(`/station/${stationId}`);
        }
      });
    });
    
    


// Remove
app.post("/station/:id/delete", urlencodedParser, function(req, res){
  var stationId = req.params.id;
  console.log(`Deleting station with ID: ${stationId}`);

    // Delete from weathers table first because of foreign key error
    dbClient.query("DELETE FROM weathers WHERE station_id = $1", [stationId], function(dbError, dbResponse) {
      if (dbError) {
        console.error("Error deleting from weathers:", dbError);
        res.status(500).send(`Error deleting from weathers: ${dbError.message}`);
        return dbClient.query("ROLLBACK", (err) => {
          if (err) {
            console.error("Error rolling back transaction:", err);
          }
        });
      } else {
        // Delete from stations table
        dbClient.query("DELETE FROM stations WHERE id = $1", [stationId], function(dbError, dbResponse) {
          if (dbError) {
            console.error("Error deleting from stations:", dbError);
            res.status(500).send(`Error deleting from stations: ${dbError.message}`);
            return dbClient.query("ROLLBACK", (err) => {
              if (err) {
                console.error("Error rolling back transaction:", err);
              }
            });
          } else {
            // Commit the transaction
            dbClient.query("COMMIT", (err) => {
              if (err) {
                console.error("Error committing transaction:", err);
                res.status(500).send("Database error");
              } else {
                res.redirect("/dashboard");
              }
            });
          }
        });
      }
    });
  });


  app.post("/station/:stationId/weather/:weatherId/delete", urlencodedParser, function (req, res) {
    var weatherId = req.params.weatherId;
    console.log(`Deleting weather data with ID: ${weatherId}`);
  
    dbClient.query("DELETE FROM weathers WHERE weather_id = $1", [weatherId], function (dbError, dbResponse) {
      if (dbError) {
        console.error("Error deleting weather data:", dbError);
        res.status(500).send(`Error deleting weather data: ${dbError.message}`);
      } else {
        res.redirect(`/station/${req.params.stationId}`);
      }
    });
  });
  



