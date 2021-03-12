const bcrypt = require('bcryptjs');
// const validator = require('validator');
const { default: validator } = require('validator');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

const User = require('../models/user');
const Post = require('../models/post');
const { clearImage } = require('../util/file');

module.exports = {
  createUser: async function ({ userInput }, req) {
    const { name, email, password } = userInput;
    const errors = [];
    if (!validator.isEmail(email)) {
      errors.push({ message: 'E-Mail is invalid' });
    }
    if (
      validator.isEmpty(password) ||
      !validator.isLength(password, { min: 5 })
    ) {
      errors.push({ message: 'Password too short' });
    }
    if (errors.length > 0) {
      const error = new Error('Invalid input mate!');
      error.data = errors;
      error.code = 422;
      throw error;
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const error = new Error('User already exists mate!');
      throw error;
    }

    const hashedPwd = await bcrypt.hash(password, 12);
    const user = new User({
      name,
      email,
      password: hashedPwd,
    });

    const createdUser = await user.save();
    return { ...createdUser._doc, _id: createdUser._id.toString() };
  },

  login: async function ({ email, password }, req) {
    const user = await User.findOne({ email });
    if (!user) {
      const error = new Error('User not found, mate');
      error.code = 401;
      throw error;
    }
    const passwordIsWrong = !(await bcrypt.compare(password, user.password));
    console.log('login passwordIsWrong =>', passwordIsWrong);
    if (passwordIsWrong) {
      const error = new Error('Wrong password mate! Try again!');
      error.code = 401;
      throw error;
    }
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
      },
      'somesupersecretsecretthatisverylong',
      { expiresIn: '1h' }
    );

    return {
      token,
      userId: user._id.toString(),
    };
  },

  createPost: async function ({ postInput }, req) {
    const userNotAuthenticated = !req.isAuth;
    if (userNotAuthenticated) {
      const error = new Error('Not authenticated');
      error.code = 401;
      throw error;
    }
    const { title, content, imageUrl } = postInput;

    const errors = [];
    if (validator.isEmpty(title) || !validator.isLength(title, { min: 5 }))
      errors.push({ message: 'Title is invalid' });
    if (validator.isEmpty(content) || !validator.isLength(content, { min: 5 }))
      errors.push({ message: 'Content is invalid' });
    if (errors.length > 0) {
      const error = new Error('Invalid input mate!');
      error.data = errors;
      error.code = 422;
      throw error;
    }

    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('User not found');
      error.code = 404;
      throw error;
    }

    const post = new Post({
      title,
      content,
      imageUrl,
      creator: user,
    });
    const createdPost = await post.save();
    user.posts.push(createdPost);
    await user.save();
    console.log('Created post => ', createdPost);
    // Add post to user's post
    return {
      ...createdPost._doc,
      _id: createdPost._id.toString(),
      createdAt: createdPost.createdAt.toISOString(),
      updatedAt: createdPost.updatedAt.toISOString(),
    };
  },

  post: async function ({ postId }, req) {
    const userNotAuthenticated = !req.isAuth;
    if (userNotAuthenticated) {
      const error = new Error('Not authenticated');
      error.code = 401;
      throw error;
    }

    const post = await Post.findById(postId).populate('creator');
    if (!post) {
      const error = new Error('Post not found');
      error.code = 404;
      throw error;
    }

    return {
      ...post._doc,
      _id: post._id.toString(),
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  },

  posts: async function ({ page }, req) {
    const userNotAuthenticated = !req.isAuth;
    // if (userNotAuthenticated) {
    //   const error = new Error('Not authenticated');
    //   error.code = 401;
    //   throw error;
    // }

    if (!page) page = 1;
    const perPage = 2;

    const totalPosts = await Post.find().countDocuments();
    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .populate('creator');
    if (!posts) {
      const error = new Error('No posts found, maate 😅');
      error.code = 401;
      throw error;
    }

    return {
      posts: posts.map(post => ({
        ...post._doc,
        _id: post._id.toString(),
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
      })),
      totalPosts,
    };
  },

  updatePost: async function ({ postId, postInput }, req) {
    const userNotAuthenticated = !req.isAuth;
    if (userNotAuthenticated) {
      const error = new Error('Update post => not authenticated mate!');
      error.code = 401;
      throw error;
    }
    const post = await Post.findById(postId).populate('creator');
    if (!post) {
      const error = new Error('Update post => post not found');
      error.code = 404;
      throw error;
    }

    if (post.creator._id.toString() !== req.userId) {
      const error = new Error('Update post => not authorized');
      error.code = 403;
      throw error;
    }

    const { title, imageUrl, content } = postInput;
    console.log('Update post imageUrl =>', imageUrl);
    const errors = [];
    if (validator.isEmpty(title) || !validator.isLength(title, { min: 5 }))
      errors.push({ message: 'Title is invalid' });
    if (validator.isEmpty(content) || !validator.isLength(content, { min: 5 }))
      errors.push({ message: 'Content is invalid' });
    if (errors.length > 0) {
      const error = new Error('Invalid input mate!');
      error.data = errors;
      error.code = 422;
      throw error;
    }

    post.title = title;
    post.content = content;
    if (postInput.imageUrl !== 'undefined') post.imageUrl = imageUrl;

    const updatedPost = await post.save();
    // console.log('Updated post => ', updatedPost);

    return {
      ...updatedPost._doc,
      _id: updatedPost._id.toString(),
      createdAt: updatedPost.createdAt.toISOString(),
      updatedAt: updatedPost.updatedAt.toISOString(),
    };
  },

  deletePost: async function ({ postId }, req) {
    const userNotAuthenticated = !req.isAuth;
    if (userNotAuthenticated) {
      const error = new Error('Update post => not authenticated mate!');
      error.code = 401;
      throw error;
    }
    const post = await Post.findById(postId);
    if (!post) {
      const error = new Error('Update post => post not found');
      error.code = 404;
      throw error;
    }

    if (post.creator.toString() !== req.userId) {
      const error = new Error('Update post => not authorized');
      error.code = 403;
      throw error;
    }

    clearImage(post.imageUrl.replace('/', '\\'));
    await Post.findByIdAndRemove(postId);

    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('User not found');
      error.code = 404;
      throw error;
    }
    user.posts.pull(postId);
    await user.save();
    return true;
  },

  user: async function (args, req) {
    const userNotAuthenticated = !req.isAuth;
    if (userNotAuthenticated) {
      const error = new Error('Update post => not authenticated mate!');
      error.code = 401;
      throw error;
    }
    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('User not found');
      error.code = 404;
      throw error;
    }

    console.log('Inside user query');

    return {
      ...user._doc,
      _id: user._id.toString(),
    };
  },

  updateStatus: async function ({ status }, req) {
    const userNotAuthenticated = !req.isAuth;
    if (userNotAuthenticated) {
      const error = new Error('Update post => not authenticated mate!');
      error.code = 401;
      throw error;
    }
    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('User not found');
      error.code = 404;
      throw error;
    }

    if (user._id.toString() !== req.userId) {
      const error = new Error('Update status => not authorized');
      error.code = 403;
      throw error;
    }
    user.status = status;

    return {
      ...user._doc,
      _id: user._id.toString(),
    };
  },
};
