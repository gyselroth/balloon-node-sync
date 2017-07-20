var async = require('async');

var localActionHandlerFactory = require('./local-action-handler-factory.js');
var remoteActionHandlerFactory = require('./remote-action-handler-factory.js');
var transferQueueFactory = require('./transfer-queue-factory.js');

module.exports = function() {
  var exposedQueue = {};

  var transferQueue = transferQueueFactory();
  var actionHandlers = {
    'local': localActionHandlerFactory(exposedQueue, transferQueue),
    'remote': remoteActionHandlerFactory(exposedQueue, transferQueue)
  }

  var queue = async.priorityQueue((task, callback) => {
    actionHandlers[task.origin][task.action](task, callback);
  }, 1);

  queue.pause();


  function finished() {
    return(
      //all tasks in queu have finished
      queue.running() === 0 && queue.idle()
      &&
      //transferQueue has finished
      transferQueue.finished()
    );
  }

  function mightFinish() {
    if(finished()) {
      if(exposedQueue.finishCallback) {
        exposedQueue.finishCallback();
        delete exposedQueue.finishCallback;
      }

      if(exposedQueue.stoppedCallback) {
        exposedQueue.stoppedCallback();
        delete exposedQueue.stoppedCallback;
      }
    }
  }

  exposedQueue.push = function(origin, task, priority) {
    if(!task.created) task.created = new Date();

    task.origin = origin;

    //set priority
    var immediate = task.immediate ? 0 : 1;
    var directory = task.node.directory ? 0 : 6;

    if(!priority) {
      switch(task.origin) {
        case 'remote':
          switch(task.action) {
            case 'renamemove':
              action = 1;
            break;
            case 'create':
              action = 4;
            break;
            case 'remove':
              action = 11;
            break;
          }
        break;

        case 'local':
          switch(task.action) {
            case 'renamemove':
              action = 21;
            break;
            case 'create':
              action = 24;
            break;
            case 'remove':
              action = 31;
            break;
          }
        break;
      }

      var priority = immediate + directory + action;
    }

    task.priority = priority;

    queue.push(task, priority, () => {
      mightFinish();
    });
  }

  exposedQueue.remove = function(testFn) {
    queue.remove(testFn);

    transferQueue.remove(testFn);
  }

  exposedQueue.process = function(callback) {
    if(this.finishCallback) {
      logger.warning('ActionQueue: process has already been called');
      return callback(null);
    }

    this.finishCallback = callback;

    queue.resume();

    if(finished()) {
      mightFinish();
    } else {
      transferQueue.drain = queue.drain = mightFinish;
    }
  }

  exposedQueue.stop = function(callback) {
    this.stoppedCallback = callback;
    queue.kill();

    transferQueue.stop(function() {
      mightFinish();
    });

    mightFinish();
  }

  return exposedQueue;
}
