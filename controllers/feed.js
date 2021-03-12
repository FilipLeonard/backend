const fs = require('fs');
const path = require('path');

const { validationResult } = require('express-validator');

const { getIO } = require('../socket');
const Post = require('../models/post');
const User = require('../models/user');

exports.getPosts = async (req, res, next) => {
  const { page: currentPage } = req.query || 1;
  const perPage = 2;
  try {
    let totalItems = await Post.find().countDocuments();
    const posts = await Post.find()
      .populate('ceator')
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage);
    res.status(200).json({
      message: 'Fetched posts successfully',
      posts,
      totalItems,
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};

exports.postPost = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const error = new Error('Validation failed, entered data is incorrect');
      error.statusCode = 422; //Validation error
      throw error;
    }

    if (!req.file) {
      const error = new Error('No image provided');
      error.statusCode = 422;
      throw error;
    }

    const imageUrl = req.file.path.replace('\\', '/');

    const { title, content } = req.body;
    const post = new Post({
      title,
      imageUrl,
      content,
      creator: req.userId,
    });

    const postSaveResult = await post.save();
    console.log('Save Post', postSaveResult);

    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('Could not find posting user in db');
      error.status = 404; //Not found error
      throw error;
    }
    user.posts.push(post);
    await user.save();

    getIO().emit('posts', {
      action: 'create',
      post: { ...post._doc, creator: { _id: req.userId, name: user.name } },
    });

    res.status(201).json({
      message: 'Post created successfully',
      post,
      creator: {
        _id: user._id,
        name: user.name,
      },
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};

exports.getPost = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      const error = new Error('Could not find post in db');
      error.status = 404; //Not found error
      throw error;
    }

    res.status(200).json({ message: 'Post fetched', post });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};

exports.updatePost = async (req, res, next) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const error = new Error('Validation failed, entered data is incorrect');
      error.statusCode = 422; //Validation error
      throw error;
    }
    const { postId } = req.params;
    const { title, content } = req.body;
    let imageUrl = req.body.image; // if no new pic was picked
    if (req.file) {
      imageUrl = req.file.path.replace('\\', '/');
    }

    if (!imageUrl) {
      const error = new Error('No file picked!');
      error.statusCode = 422;
      throw error;
    }

    const post = await Post.findById(postId).populate('creator');
    if (!post) {
      const error = new Error('Could not find post in db');
      error.status = 404; //Not found error
      throw error;
    }

    if (post.creator._id.toString() !== req.userId) {
      const error = new Error('Not authorized to edit other users content');
      error.statusCode = 403;
      throw error;
    }
    if (imageUrl !== post.imageUrl) {
      clearImage(post.imageUrl);
    }

    post.title = title;
    post.imageUrl = imageUrl;
    post.content = content;
    const result = await post.save();
    getIO().emit('posts', {
      action: 'update',
      post: result,
    });
    console.log('Update Post', result);

    res.status(200).json({
      message: 'Post updated successfully',
      post: result,
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};

exports.deletePost = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
      const error = new Error('Could not find post in db');
      error.status = 404; //Not found error
      throw error;
    }
    if (post.creator.toString() !== req.userId) {
      const error = new Error('Not authorized to delete other users content');
      error.statusCode = 403;
      throw error;
    }
    clearImage(post.imageUrl);

    await Post.findByIdAndRemove(postId);

    const user = await User.findById(req.userId);
    user.posts.pull(postId); //remove the reference of the just deleted post, from the creator user

    await user.save();
    console.log('Emitting deletion..');
    getIO().emit('posts', { action: 'delete', post: postId });
    res.status(200).json({
      message: 'Post deleted successfully',
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};

exports.getStatus = async (req, res, next) => {
  try {
    const { userId } = req;
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('Could not find user');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      message: 'Status fetched',
      status: user.status,
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { userId } = req;
    const { status: newStatus } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error('Could not find user');
      error.statusCode = 404;
      throw error;
    }

    console.log('new Status', newStatus);

    user.status = newStatus;
    console.log('postStatus user => ', user);
    const result = await user.save();

    res.status(200).json({
      message: 'Status fetched',
      result,
    });
  } catch (error) {
    if (!error.statusCode) error.statusCode = 500;
    next(error);
  }
};

const clearImage = filePath => {
  const imagePath = path.join(__dirname, '..', filePath);
  fs.unlink(imagePath, err => console.log(err));
};
