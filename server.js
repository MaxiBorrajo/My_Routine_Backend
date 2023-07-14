//imports
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const app = express();
const morgan = require("morgan");
const cookie_parser = require("cookie-parser");
const cors = require("cors");
const passport = require("passport");
const xss = require("xss-clean");
const helmet = require("helmet");
const error_handler_middleware = require("./src/middlewares/error_handler_middleware");
const user_route = require("./src/routes/user_route");
const routine_route = require("./src/routes/routine_route");
const exercise_route = require("./src/routes/exercise_route");
const day_route = require("./src/routes/day_route");
const muscle_group_route = require("./src/routes/muscle_group_route");
const photo_route = require("./src/routes/photo_route");
const set_route = require("./src/routes/set_route");

//dependencies
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));
app.use(cookie_parser());
app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(helmet());
app.use(xss());
//routes
app.use("/v1/user", user_route);
app.use("/v1/routine", routine_route);
app.use("/v1/exercise", exercise_route);
app.use("/v1/day", day_route);
app.use("/v1/muscle_group", muscle_group_route);
app.use("/v1/photo", photo_route);
app.use("/v1/set", set_route);

//global middlewares
app.use(error_handler_middleware);

//exports
module.exports = app;
