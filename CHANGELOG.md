## 0.6.5
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Tue Feb 18 03:14:04 CET 2020

### Bugfixes
* do not cache apiUrl #42
* Log response body for failed download requests #22
* Use Buffer.from() instead of new Buffer() #43

### Changes
* Cancel upload if file has been changed or deleted #44


## 0.6.4
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Mon Feb 17 19:08:30 CET 2020

### Bugfixes
* file upload should send exact chunkSize #40

### Changes
* Don't start download progress logging before initial response #39


## 0.6.3
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Fri Feb 14 02:39:23 CET 2020

### Changes
* Add error codes E_BLN_API_REQUEST_QUOTA_FULL and E_BLN_API_REQUEST_NETWORK #37


## 0.6.2
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Wed Jan 22 23:08:34 CET 2020

### Bugfixes
* Fix TypeError: Cannot mix BigInt and other types during upload #35


## 0.6.1
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Wed Jan 10 19:03:44 CET 2020

### Changes
* Update winston to v3.2 #33


## 0.6.0
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Wed Jan 10 01:16:44 CET 2020

### Changes
* Remove @gyselroth/windows-fsstat dependency #31

### Common
* Update dependencies
* Update node version to v12


## 0.5.3
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Wed Jan 08 15:59:44 CET 2020

### Bugfixes
* Handle error code 20 when moving a share #29
* Remove duplicate nodes from sync-db #30

## 0.5.2
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Wed Nov 20 11:57:22 CET 2019

### Bugfixes
* Fix garbage collector #27
* Fix name is not defined #28

### Common
* Starting with v0.5.2 the changelog has a new format, all changes get splitted into sub categeories within the changelog to get a better readability.


## 0.5.1
**Maintainer**: balloon-team <opensource@gyselroth.net>\
**Date**: Wed May 23 13:41:34 CEST 2019

* CORE: [FIX] Fix ESOCKETIMEOUT during initial download is not correctly rescheduled


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
