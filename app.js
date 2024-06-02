var express = require("express");
var pg = require("pg");
var bodyParser = require("body-parser");
var dotenv = require("dotenv");

dotenv.config(); // Load environment variables from .env file

const conString = process.env.DB_CON_STRING;

if (!conString) {
  console.log("ERROR: environment variable DB_CON_STRING not set.");
  process.exit(1);
} else {
  console.log("Database connection string:", conString);
}

const dbConfig = {
  connectionString: conString,
  ssl: { rejectUnauthorized: false }
};

var dbClient = new pg.Client(dbConfig);

console.log("Attempting to connect to the database...");
dbClient.connect(err => {
  if (err) {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
  } else {
    console.log("Connected to the database.");
  }
});

var app = express();
var urlencodedParser = bodyParser.urlencoded({ extended: false });

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
  console.log(`Rendering dashboard`); // Output in terminal

  // Query the database for weather data
  dbClient.query("SELECT * FROM weather", (dbError, dbResponse) => {
    if (dbError) {
      console.error("Error executing query:", dbError);
      res.status(500).send("Error querying the database");
    } else {
      console.log("Query executed successfully");
      res.render("dashboard", { weatherData: dbResponse.rows }); // Pass weather data to Pug template
    }
  });
});

// Route to render Pug template for the station page with dynamic ID
app.get("/station/:id", (req, res) => {
  const stationId = req.params.id; // Get the id from the URL
  console.log(`Accessing stations ${stationId}`);
  res.render("station", { stationId }); // Pass stationId to the template
});

app.listen(process.env.PORT, () => {
  console.log(`Weathertop running and listening on port ${process.env.PORT}`); // Output in terminal
});

// Close database connection 
process.on('SIGTERM', () => {
  dbClient.end();
  console.log("Database disconnected.");
});
