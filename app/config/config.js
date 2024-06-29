'use strict';

//
// config.js
// Application configuration settings
//
// VDJServer Community Data Portal
// Statistics API service
// https://vdjserver.org
//
// Copyright (C) 2020 The University of Texas Southwestern Medical Center
//
// Author: Scott Christley <scott.christley@utsouthwestern.edu>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//

var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');

var config = {};

module.exports = config;

function parseBoolean(value)
{
    if (value == 'true') return true;
    else if (value == 1) return true;
    else return false;
}

// General
config.name = 'VDJ-STATS-API';
config.port = process.env.STATS_API_PORT;
config.tapis_version = process.env.TAPIS_VERSION;

// Host user and group
config.hostServiceAccount = process.env.HOST_SERVICE_ACCOUNT;
config.hostServiceGroup = process.env.HOST_SERVICE_GROUP;
config.vdjserver_data_path = process.env.VDJSERVER_DATA_PATH;
config.lrqdata_path = process.env.LRQDATA_PATH;

// Queues
config.redis_port = 6379;
config.redis_host = 'vdjr-redis';
config.enable_cache = parseBoolean(process.env.STATS_API_ENABLE_CACHE);
config.statistics_app = process.env.STATS_TAPIS_APP;
config.statistics_app_queue = process.env.STATS_TAPIS_APP_QUEUE;
config.statistics_max_jobs = process.env.STATS_MAX_JOBS;
config.statistics_time_multiplier = process.env.STATS_TIME_MULTIPLIER;

// Error/debug reporting
config.debug = parseBoolean(process.env.DEBUG_CONSOLE);

// standard info/error reporting
config.log = {};
config.log.info = function(context, msg, ignore_debug = false) {
    var date = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    var full_msg = date + ' - ' + config.name + ' INFO (' + context + '): ' + msg;
    if (ignore_debug)
        console.log(full_msg);
    else
        if (config.debug) console.log(full_msg);
    return full_msg;
}

config.log.error = function(context, msg) {
    var date = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    var full_msg = date + ' - ' + config.name + ' ERROR (' + context + '): ' + msg
    console.error(full_msg);
    return full_msg;
}
config.log.info('config', 'Debug console messages are enabled.', true);

// AIRR Data Commons
config.adcRepositoryEntry = process.env.ADC_REPOSITORY_ENTRY;
if (! config.adcRepositoryEntry) config.adcRepositoryEntry = 'adc';
config.log.info('config', 'adc_system_repositories entry = ' + config.adcRepositoryEntry, true);

// get service info
var packageFile = fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8');
config.package = JSON.parse(packageFile);

// get api info
var apiFile = fs.readFileSync(path.resolve(__dirname, '../../specifications/stats-api.yaml'), 'utf8');
config.api = yaml.safeLoad(apiFile);

config.info = {
    title: config.package.name,
    description: config.package.description,
    version: config.package.version,
    contact: {
        name: config.package.author[0].name,
        email: config.package.author[0].email,
        url: config.package.website.url
    },
    api: config.api.info
};
