//imports
const {
  create_new_auth,
  delete_auth_by_id_user,
  find_auth_by_id_user,
  update_auth,
} = require("../repositories/auth_repository");
const {
  create_new_user,
  delete_user_by_id_user,
  find_user_by_email,
  find_user_by_id_user,
  update_user,
} = require("../repositories/user_repository");
const { create_new_feedback } = require("../repositories/feedback_repository");
const {
  create_new_invalid_token,
  delete_invalid_tokens_by_id_user,
} = require("../repositories/invalid_token_repository");
const {
  delete_image_in_cloud,
} = require("../middlewares/upload_images_middleware");
const CustomError = require("../utils/custom_error");
const send_email = require("../utils/send_email");
const {
  encrypt_password,
  match_passwords,
  generate_tokens,
  get_reset_password_token,
  get_authorization,
} = require("../utils/user_utils");
const {
  return_response,
  is_greater_than,
  are_equal,
} = require("../utils/utils_functions");
const jwt = require("jsonwebtoken");

//functions
/**
 * Controller that register a new user into database
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError} If a user with the same email is found in database,
 * if something fails while creating the user or if something fails while creating
 * the authentication
 */
async function register(req, res, next) {
  try {
    const { email, password, name, last_name } = req.body;

    const user = await find_user_by_email(email);

    if (is_greater_than(user.length, 0)) {
      return next(new CustomError("User already exists", 400));
    }

    const new_user = {
      email: email,
      name: name,
      last_name: last_name,
      password: await encrypt_password(password),
    };

    const created_user = await create_new_user(new_user);

    if (!are_equal(created_user, 1)) {
      return next(
        new CustomError("Something went wrong. User not created", 500)
      );
    }

    let found_user = await find_user_by_email(email);

    return get_authorization(found_user[0], res, next);
  } catch (error) {
    next(error);
  }
}
/**
 * Controller that allows login
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError} If the user isn't found in database,
 * if the password doesn't match the one stored in database or if something
 * goes wrong with the authentication;
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    let found_user = await find_user_by_email(email);

    if (
      are_equal(found_user.length, 0) ||
      !(await match_passwords(password, found_user[0].password))
    ) {
      return next(new CustomError("Email or password are incorrect", 404));
    }

    return get_authorization(found_user[0], res, next);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller that handles callback from register or login with google
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError} If the user isn't found in database or if authentication
 * fails in creation or authentication
 */
async function google_authentication(req, res, next) {
  try {
    return get_authorization(req.user, res, next);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller that sends a password change email
 * to the address provided.
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError} If the user isn't found in database or if authentication
 * cannot be sent
 */
async function forgot_password(req, res, next) {
  try {
    const { email } = req.body;

    const found_user = await find_user_by_email(email);

    if (are_equal(found_user.length, 0)) {
      return next(new CustomError("User not found", 404));
    }

    const found_auth = await find_auth_by_id_user(found_user[0].id_user);

    const { reset_password_token, reset_password_token_expiration } =
      get_reset_password_token(found_user[0].id_user);

    const new_auth = {
      id_user: found_auth[0].id_user,
      reset_password_token: reset_password_token,
      reset_password_token_expiration: reset_password_token_expiration,
      refresh_token: found_auth[0].refresh_token,
    };

    const updated_auth = await update_auth(new_auth);

    if (!are_equal(updated_auth, 1)) {
      return next(
        new CustomError("Something went wrong. Try again later", 404)
      );
    }

    const reset_password_url = `http://localhost:3000/v1/user/reset_password/${reset_password_token}`; //link al front
    //esto despues va a ser un archivo html lindo
    const reset_password_email_body = `
        <h1>Reset password</h1>
        <p>To reset your password click the following link: </p>
        <a href='${reset_password_url}' rel='noreferrer' referrerpolicy='origin' clicktracking='off'>Change your password</a>
      `;

    send_email({
      to: email,
      subject: "Password Reset Requested",
      text: reset_password_email_body,
      html: reset_password_email_body,
    });

    return return_response(
      res,
      200,
      {
        message:
          "Email sent. Go to your email account and finish the operation",
      },
      true
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller that change the password of the user encrypted
 * in the reset password token
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError}  If any the reset password token was provided, if
 * any password was provided, if the verification code is not same as the one
 * stored in database, if it is expired, if the user isn't found in database
 * or if the authentication associated with the user isn't found
 */
async function reset_password(req, res, next) {
  try {
    if (!req.params.reset_password_token) {
      return next(new CustomError("Any verification code was provided", 400));
    }

    if (!req.body.password) {
      return next(new CustomError("Any password was provided", 400));
    }

    const payload = jwt.verify(
      req.params.reset_password_token,
      process.env.ACCESS_JWT_SECRET
    );

    let found_user = await find_user_by_id_user(payload.id_user);

    if (are_equal(found_user.length, 0)) {
      return next(new CustomError("User not found", 404));
    }

    let found_auth = await find_auth_by_id_user(found_user[0].id_user);

    if (are_equal(found_auth.length, 0)) {
      return next(new CustomError("Authentication not found", 404));
    }

    if (
      !are_equal(
        req.params.reset_password_token,
        found_auth[0].reset_password_token
      )
    ) {
      return next(new CustomError("Invalid authorization", 401));
    }

    if (
      is_greater_than(
        new Date(Date.now()).toISOString(),
        found_auth[0].reset_password_token_expiration
      )
    ) {
      return next(new CustomError("Your verification token has expired", 400));
    }

    found_user[0].password = await encrypt_password(req.body.password);
    found_auth[0].reset_password_token = "";
    found_auth[0].reset_password_token_expiration = new Date(
      Date.now()
    ).toISOString();
    const updated_user = await update_user(found_user[0]);

    await update_auth(found_auth[0]);

    if (!are_equal(updated_user, 1)) {
      return next(
        new CustomError("Something went wrong. Try again later", 500)
      );
    }

    return return_response(
      res,
      200,
      {
        message: "Password changed successfully",
      },
      true
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * Controller that gets current user's information
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError}  If the user isn't found or if something goes wrong
 * with the database
 */
async function get_current_user(req, res, next) {
  try {
    const found_user = await find_user_by_id_user(req.id_user);

    if (are_equal(found_user.length, 0)) {
      return next(new CustomError("User not found", 404));
    }

    delete found_user[0].id_user;
    delete found_user[0].password;

    return return_response(res, 200, found_user[0], true);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller that updates the current user with the information given
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError} If the user tries to change his password, if the user isn't found in database
 * or if something goes wrong with the database
 */
async function update_current_user(req, res, next) {
  try {
    if(!req.body){
      return next(new CustomError("You must update, at least, one attribute", 400));
    }

    if (req.body.password) {
      if (req.file) {
        await delete_image_in_cloud(req.file.public_id);
      }
      return next(new CustomError("You cannot change your password here", 404));//luego agregar link al front
    }

    const found_user = await find_user_by_id_user(req.id_user);

    if (are_equal(found_user.length, 0)) {
      if (req.file) {
        await delete_image_in_cloud(req.file.public_id);
      }
      return next(new CustomError("User not found", 404));
    }

    if (!are_equal(found_user[0].public_id_profile_photo, "default_bx6tka")) {
      await delete_image_in_cloud(found_user[0].public_id_profile_photo);
    }

    if (req.body.email) {
      const found_user = await find_user_by_email(req.body.email);
      if (is_greater_than(found_user.length, 0)) {
        if (req.file) {
          await delete_image_in_cloud(req.file.public_id);
        }
        return next(
          new CustomError(
            "There is already a user with this email address",
            400
          )
        );
      }
    }

    const new_user_information = {
      id_user: found_user[0].id_user,
      email: req.body.email ? req.body.email : found_user[0].email,
      name: req.body.name ? req.body.name : found_user[0].name,
      last_name: req.body.last_name
        ? req.body.last_name
        : found_user[0].last_name,
      username: req.body.username ? req.body.username : found_user[0].username,
      public_id_profile_photo:
        req.file && req.file.public_id
          ? req.file.public_id
          : found_user[0].public_id_profile_photo,
      url_profile_photo:
        req.file && req.file.url
          ? req.file.url
          : found_user[0].url_profile_photo,
      password: found_user[0].password,
      date_birth: req.body.date_birth
        ? req.body.date_birth
        : found_user[0].date_birth,
      theme: req.body.theme ? req.body.theme : found_user[0].theme,
      experience: req.body.experience
        ? req.body.experience
        : found_user[0].experience,
      weight: req.body.weight ? req.body.weight : found_user[0].weight,
      goal: req.body.goal ? req.body.goal : found_user[0].goal,
      rating: req.body.rating ? req.body.rating : found_user[0].rating,
    };

    const updated_user = await update_user(new_user_information);

    if (are_equal(updated_user, 0)) {
      if (req.file) {
        await delete_image_in_cloud(req.file.public_id);
      }
      return next(new CustomError("User not updated", 500));
    }

    delete new_user_information.id_user;
    delete new_user_information.password;

    return return_response(res, 200, new_user_information, true);
  } catch (error) {
    if (req.file) {
      await delete_image_in_cloud(req.file.public_id);
    }
    next(error);
  }
}

/**
 * Controller that removes authorization of the current user
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError} If something goes wrong with the database
 */
async function logout(req, res, next) {
  let new_invalid_token = {
    id_user: req.id_user,
    token: req.cookies.access_token,
  };

  await create_new_invalid_token(new_invalid_token);

  new_invalid_token.token = req.cookies.refresh_token;

  await create_new_invalid_token(new_invalid_token);

  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  if(req.user){
    req.logout();
  }
  return return_response(
    res,
    200,
    { message: "You have successfully logged out" },
    true
  );
}

/**
 * Controller that send feedback about the app
 *
 * @param {Object} req - The request object from the HTTP request.
 * @param {Object} res - The response object from the HTTP response.
 * @param {Function} next - The next function in the middleware chain.
 * @throws {CustomError} If something goes wrong with the database
 */
async function send_feedback(req, res, next) {
  const { comment } = req.body;

  const new_feedback = {
    id_user: req.id_user,
    comment: comment,
  };

  const created_feedback = await create_new_feedback(new_feedback);

  if (are_equal(created_feedback.length, 0)) {
    return next(new CustomError("Something went wrong with the database", 500));
  }

  return return_response(res, 201, { message: "Feedback sent" }, true);
}

module.exports = {
  register,
  google_authentication,
  forgot_password,
  reset_password,
  login,
  get_current_user,
  update_current_user,
  logout,
  send_feedback,
};