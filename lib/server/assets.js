const path = require('path');
const fs = require('fs');
const assert = require('assert');
const expandHomeDir = require('expand-home-dir');
const utils = require('./utils');
const url = require('url');
const debug = require('debug')('assets');
const mime = require('mime');
const helpers = require('./helpers');

var config = null;

function assets(opt) {
  config = opt || {};
  config.allowOriginAll = config.allowOriginAll === undefined ? true : config.allowOriginAll;

  if (!/win32/.test(process.platform)) {
    config.root = expandHomeDir(config.root);
  }

  return assetsHandler;
}

function isUrl(url) {
  return url && /^http(s)?:\/\//.test(url);
}

function isTextFile(extname) {
  var files = ['.js', '.css', '.html', '.txt', '.json', '.shtml', '.cgi', '.fcgi'];
  return files.indexOf(extname) > -1;
}

function setHeadersForLocal(ctx, targetUrl) {
  var urlParams = url.parse(targetUrl);
  var extname = path.extname(urlParams.pathname);
  var type;
  var resHeader = ctx.response.headers;

  if (extname === '.cgi' || extname === '.fcgi') {
    type = mime.lookup('.json');
  } else {
    type = (extname === '.shtml') ? mime.lookup('.html') : mime.lookup(ctx._extname || extname);
  }
  if (!resHeader['Content-Type'] && !resHeader['content-type']) {
    ctx.set('Content-Type', type + (isTextFile(extname) ? '; charset=utf-8' : ''));
  }
  if (type.indexOf('video') > -1) {
    ctx.set('Accept-Ranges', 'bytes')
  }
}


function setHeaders(ctx, headers, targetUrl) {
  ctx.set('Access-Control-Allow-Origin', '*');
  ctx.set('Access-Control-Allow-Credentials', true);
  ctx.set('Last-Modified', (new Date).toUTCString());
  ctx.set('Cache-Control', 'max-age=0');

  if (typeof headers === 'function') {
    headers(ctx)
  } else if (headers) {
    Object.keys(headers).forEach(key => {
      ctx.set(key, headers[key]);
    })
  }
}

async function assetsHandler(ctx, next) {
  assert(config.root, 'root dir required');
  await next();

  if (ctx.body === undefined) {
    var urlParams = url.parse(ctx.href);
    var {targetUrl, headers} = utils.getTargetUrl(config.urls, urlParams.path, urlParams);
    var result;
    debug('===> ' + targetUrl);
    if (targetUrl) {
      setHeaders(ctx, headers, targetUrl)
      if (isUrl(targetUrl)) {
        result = await utils.getRemoteContent(ctx, targetUrl);
      } else {
        setHeadersForLocal(ctx, targetUrl)
        result = await utils.getLocalContent(ctx, targetUrl, config);
      }
    } else if (utils.canDnsRequest(ctx.host)) {
      result = await utils.getRemoteContent(ctx)
    } else {
      debug('===> not found: ' + ctx.pathname);
      return utils.notFound(ctx);
    }

    if (result === null) {
      return utils.notFound(ctx);
    } else if (result) {
      ctx.body = result;
    }

    if (config.debug) {
      helpers.injectWeinreIntoBody(ctx);
    }
  }
}

module.exports = assets;