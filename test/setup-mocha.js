//inject mocha globally to allow custom interface refer without direct import - bypass bundle issue
global._ = require('lodash');
global.mocha = require('mocha');
global.chai = require('chai');
global.sinon = require('sinon');
global.chai.use(require('sinon-chai'));

global.COLOR_RED = 1;
global.COLOR_PURPLE = 2;
global.COLOR_BLUE = 3;
global.COLOR_GREY = 4;
global.COLOR_WHITE = 5;
global.COLOR_BROWN = 6;
global.COLOR_GREEN = 7;
global.COLOR_YELLOW = 8;
global.COLOR_ORANGE = 9;
global.COLOR_CYAN = 10;

// Override ts-node compiler options
process.env.TS_NODE_PROJECT = 'tsconfig.test.json'
