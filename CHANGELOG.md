## 0.3.0
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**:

* CORE [FIX] Avoid loosing remote history #20
* CORE [FIX] avoid deleting a node if its ino changes after getDelta starts #23


## 0.2.5
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Fri Novemer 02 12:26:33 CET 2018

* CORE [FIX] Avoid leaking authorization header to logs #13
* CORE [FIX] Catch ENOENT after creating a collection #14
* CORE [FIX] Avoid Uncaught ReferenceError: task is not defined #16
* CORE [FIX] Wrong renamemove detected, after applying selective sync settings #15
* CORE [FIX] Race condition in delta #17
* CORE [FIX] Error handling for file downloads, if node is not found in db #18
* CORE [CHANGE] emit watcher startup gyselroth/balloon-client-desktop#130
* CORE [CHANGE] improve rename of conflict files #19
