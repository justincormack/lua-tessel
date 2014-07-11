# lua-tessel
A CLI that enables the scripting of a [Tessel](https://tessel.io/) device in Lua.

---


## Please note
This is work in progress and we're not quite there yet. There are issues yet to resolve and the API is likely to change. Please be patient.

I've shared this project now because the main route to executing Lua scripts on the Tessel is working and that feature may be of help to others.



## Getting started
```shell
git clone git@github.com:paulcuth/lua-tessel.git
cd lua-tessel
npm install -g
lua-tessel run examples/blink/blink.lua
```


## Features
You can currently run and flash Lua scripts to a USB-connected Tessel device. For everything else, including erasing a flashed Lua script, you will need to use the [official Tessel CLI](https://github.com/tessel/cli).



## Built-in modules
lua-tessel restores the developement environment on the Tessel back to a default Lua 5.1 environment. However there are also a few modules that are available to be loaded from package.preload:

### bit32
Bitwise operations as described in the [Lua docs](http://www.lua.org/manual/5.2/manual.html#6.7).

### http
HTTP functions as described in the [Node docs](http://nodejs.org/api/http.html).

### json
JSON functions as described on [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON#Methods).

### tessel
Allows access to features on the board. The API is described in the [Tessel docs](https://tessel.io/docs/hardwareAPI).

### util
Provides some useful functionality that is available in the Tessel runtime. Currently, the following methods are available:
- `util.clearImmediate(ref)` - Prevents an immediate callback from executing.
- `util.clearInterval(ref)` - Stops an interval.
- `util.clearTimeout(ref)` - Prevents a timeout from executing.
- `ref = util.setImmediate(func)` - Execute a callback on the next tick.
- `ref = util.setInterval(func, delay)` - Execute a callback repeatedly with a specified delay (in ms).
- `ref = util.setTimeout(func, delay)` - Execute a callback once after a specified delay (in ms).

If you know of any other functionality in the Tessel runtime and you'd like to see it here, please create an issue or send a pull request.


## Issues
Please report any new issues you find in the [Issue tracker](https://github.com/paulcuth/lua-tessel/issues).

If you find a blocking issue, please consider fixing it and submitting a pull request.



## Acknowledgements
While this is a rewrite rather than a fork of the [official Tessel CLI](https://github.com/tessel/cli), there are several chucks of code taken from that project.


## License

MIT
