local tessel = require 'tessel'
local ambientlib = require 'ambient-attx4'
local util = require 'util'

local port = tessel.ports['A']
local ambient = ambientlib:use(port)

]]

local tessel = require "tessel"
local accellib = require "accel-mma84"

local console = tessel.console
local accel = accellib:use(tessel.ports.A)

accel:on('ready', function()
	accel:on('data', function(xyz)
		print('x:', xyz[1], 'y:', xyz[2], 'z:', xyz[3])
	end)
end)