const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/user');

exports.signup = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error('Validation failed, entered data is incorrect');
      error.statusCode = 422; //Validation error
      error.data = errors.array();
      throw error;
    }
    const { name, email, password } = req.body;
    const hashedPwd = await bcrypt.hash(password, 12);

    const user = new User({
      name,
      email,
      password: hashedPwd,
    });

    const result = await user.save();
    console.log('signup user.save result => ', result);

    res.status(201).json({
      message: 'User created successfully',
      userId: result._id,
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error('Validation failed, entered data is incorrect');
      error.statusCode = 422; //Validation error
      error.data = errors.array();
      throw error;
    }
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      const error = new Error('Wrong password');
      error.statusCode = 401;
      throw error;
    }
    // user credentials are valid, generate JWT (JSON Web Token)
    const token = jwt.sign(
      { email: user.email, userId: user._id.toString() },
      'somesupersecretsecretthatisverylong',
      { expiresIn: '1h' }
    );

    console.log('JWT\n', token);

    res.status(200).json({
      message: 'User logged in successfully',
      userId: user._id.toString(),
      token,
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};
