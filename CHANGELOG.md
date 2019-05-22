## 0.5.0
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Wed May 23 14:41:34 CEST 2019

* CORE: [FEATURE] Two Factor authentication https://github.com/gyselroth/balloon-client-desktop/issues/186


## 0.4.0
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Wed February 20 14:55:23 CET 2019

* No updates


## 0.3.0-rc1
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Thu February 07 12:51:25 CET 2019

* CORE: [FIX] Avoid deleting moved/renamed files #25
* CORE: [FIX] deleted flag might be a timestamp instead of a boolean #24
* CORE: [FIX] If a nodes ino changes after localDelta.getDelta started it might be accidentally deleted #23


## 0.3.0-beta2
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Fri Dezember 21 17:21:34 CET 2018

* CORE: [FIX] Avoid loosing remote history #20
* CORE: [FIX] avoid deleting a node if its ino changes after getDelta starts #23


## 0.2.5
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Fri Novemer 02 12:26:33 CET 2018

* CORE: [FIX] Avoid leaking authorization header to logs #13
* CORE: [FIX] Catch ENOENT after creating a collection #14
* CORE: [FIX] Avoid Uncaught ReferenceError: task is not defined #16
* CORE: [FIX] Wrong renamemove detected, after applying selective sync settings #15
* CORE: [FIX] Race condition in delta #17
* CORE: [FIX] Error handling for file downloads, if node is not found in db #18
* CORE: [CHANGE] emit watcher startup gyselroth/balloon-client-desktop#130
* CORE: [CHANGE] improve rename of conflict files #19
