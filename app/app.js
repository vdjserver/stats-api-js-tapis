'use strict';

//
// app.js
// Application entry point
//
// VDJServer Community Data Portal
// Statistics API service
// https://vdjserver.org
//
// Copyright (C) 2020-2024 The University of Texas Southwestern Medical Center
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

var express = require('express');
var bodyParser   = require('body-parser');
var openapi = require('express-openapi');
var path = require('path');
var fs = require('fs');
var yaml = require('js-yaml');
var $RefParser = require("@apidevtools/json-schema-ref-parser");
var airr = require('airr-js');
var vdj_schema = require('vdjserver-schema');

// Express app
var app = module.exports = express();
var context = 'app';

// Server environment config
var config = require('./config/config');
var webhookIO = require('./vendor/webhookIO');

// CORS
var allowCrossDomain = function(request, response, next) {
    response.header('Access-Control-Allow-Origin', '*');
    response.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    response.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    // intercept OPTIONS method
    if ('OPTIONS' === request.method) {
        response.status(200).end();
    }
    else {
        next();
    }
};

// Server Settings
app.set('port', config.port);
app.use(allowCrossDomain);
// trust proxy so we can get client IP
app.set('trust proxy', true);
app.redisConfig = {
    port: 6379,
    host: 'vdjr-redis'
};

// Tapis
if (config.tapis_version == 2) config.log.info(context, 'Using Tapis V2 API', true);
else if (config.tapis_version == 3) config.log.info(context, 'Using Tapis V3 API', true);
else {
    config.log.error(context, 'Invalid Tapis version, check TAPIS_VERSION environment variable');
    process.exit(1);
}
var tapisV2 = require('vdj-tapis-js/tapis');
var tapisV3 = require('vdj-tapis-js/tapisV3');
var tapisIO = null;
if (config.tapis_version == 2) tapisIO = tapisV2;
if (config.tapis_version == 3) tapisIO = tapisV3;
var tapisSettings = tapisIO.tapisSettings;
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var authController = tapisIO.authController;
tapisIO.authController.set_config(config);

// Controllers
var apiResponseController = require('./controllers/apiResponseController');
var statsController    = require('./controllers/statsController');

// Queues
var statisticsCacheQueue = require('./queues/cache-queue');

// Downgrade to host vdj user
// This is also so that the /vdjZ Corral file volume can be accessed,
// as it is restricted to the TACC vdj account.
// read/write access is required.
config.log.info(context, 'Downgrading to host user: ' + config.hostServiceAccount, true);
process.setgid(config.hostServiceGroup);
process.setuid(config.hostServiceAccount);
config.log.info(context, 'Current uid: ' + process.getuid(), true);
config.log.info(context, 'Current gid: ' + process.getgid(), true);

config.log.info(context, 'Using query collection: ' + tapisSettings.mongo_queryCollection, true);
config.log.info(context, 'Using load collection: ' + tapisSettings.mongo_loadCollection, true);

// Verify we can login with service and guest account
ServiceAccount.getToken()
    .then(function(serviceToken) {
        config.log.info(context, 'Successfully acquired service token.', true);
        return GuestAccount.getToken();
    })
    .then(function(guestToken) {
        config.log.info(context, 'Successfully acquired guest token.', true);

        // wait for the AIRR schema to be loaded
        return airr.load_schema();
    })
    .then(function() {
        config.log.info(context, 'Loaded AIRR Schema version ' + airr.get_info()['version']);

        // wait for the VDJServer schema to be loaded
        return vdj_schema.load_schema();
    })
    .then(function() {
        config.log.info(context, 'Loaded VDJServer Schema version ' + vdj_schema.get_info()['version']);

        // Connect schema to vdj-tapis
        if (tapisIO == tapisV3) tapisV3.init_with_schema(vdj_schema);

        // Load Stats API
        var apiFile = path.resolve(__dirname, '../specifications/stats-api.yaml');
        config.log.info(context, 'Using STATS API specification: ' + apiFile, true);
        var api_spec = yaml.safeLoad(fs.readFileSync(apiFile, 'utf8'));
        config.log.info(context, 'Loaded STATS API version: ' + api_spec.info.version, true);
        //console.log(api_spec);

        // Load internal admin API
        var notifyFile = path.resolve(__dirname, 'swagger/stats-admin.yaml');
        config.log.info(context, 'Using ADMIN STATS API specification: ' + notifyFile, true);
        var notify_spec = yaml.safeLoad(fs.readFileSync(notifyFile, 'utf8'));
        // copy paths
        for (var p in notify_spec['paths']) {
            api_spec['paths'][p] = notify_spec['paths'][p];
        }

        // dereference the API spec
        return $RefParser.dereference(api_spec);
    })
    .then(function(api_schema) {

        // wrap the operations functions to catch syntax errors and such
        // we do not get a good stack trace with the middleware error handler
        var try_function = async function (request, response, the_function) {
            try {
                await the_function(request, response);
            } catch (e) {
                console.error(e);
                console.error(e.stack);
                throw e;
            }
        };

        openapi.initialize({
            apiDoc: api_schema,
            app: app,
            promiseMode: true,
            errorMiddleware: function(err, req, res, next) {
                console.log('Got an error!');
                console.log(JSON.stringify(err));
                console.error(err.stack);
                if (err.status) res.status(err.status).json(err.errors);
                else res.status(500).json(err.errors);
            },
            consumesMiddleware: {
                'application/json': bodyParser.json()
                //'application/x-www-form-urlencoded': bodyParser.urlencoded({extended: true})
            },
            securityHandlers: {
                user_authorization: authController.userAuthorization,
                admin_authorization: authController.adminAuthorization,
                project_authorization: authController.projectAuthorization
            },
            operations: {
                get_service_status: async function(req, res) { return try_function(req, res, apiResponseController.confirmUpStatus); },
                get_service_info: async function(req, res) { return try_function(req, res, apiResponseController.getInfo); },

                rearrangement_count: async function(req, res) { return try_function(req, res, statsController.RearrangementCount); },
                rearrangement_junction_length: async function(req, res) { return try_function(req, res, statsController.RearrangementJunctionLength); },
                rearrangement_gene_usage: async function(req, res) { return try_function(req, res, statsController.RearrangementGeneUsage); },

                clone_count: async function(req, res) { return try_function(req, res, statsController.CloneCount); },
                clone_junction_length: async function(req, res) { return try_function(req, res, apiResponseController.notImplemented); },
                clone_gene_usage: async function(req, res) { return try_function(req, res, apiResponseController.notImplemented); },

                get_stats_cache: async function(req, res) { return try_function(req, res, statsController.getStatisticsCacheStatus); },
                update_stats_cache: async function(req, res) { return try_function(req, res, statsController.updateStatisticsCacheStatus); },
                get_stats_cache_study: async function(req, res) { return try_function(req, res, statsController.getStatisticsCacheStudyList); },
                update_stats_cache_study: async function(req, res) { return try_function(req, res, statsController.updateStatisticsCacheForStudy); },
                delete_stats_cache_study: async function(req, res) { return try_function(req, res, statsController.clearStudyCache); },
                update_stats_cache_repertoire: async function(req, res) { return try_function(req, res, statsController.updateStatisticsCacheForRepertoire); },
                delete_stats_cache_repertoire: async function(req, res) { return try_function(req, res, statsController.clearRepertoireCache); },
                stats_notify: async function(req, res) { return try_function(req, res, statsController.statsNotify); }
            }
        });

        // Start listening on port
        return new Promise(function(resolve, reject) {
            app.listen(app.get('port'), function() {
                config.log.info(context, 'VDJServer STATS API (' + config.info.version + ') service listening on port ' + app.get('port'), true);
                resolve();
            });
        });
    })
    .then(function() {
        // Initialize queues

        // Statistics cache
        if (config.enable_cache) {
            config.log.info(context, 'Statistics cache is enabled, triggering cache.', true);
            statisticsCacheQueue.triggerCache();
        } else {
            config.log.info(context, 'Statistics cache is disabled.', true);
            // TODO: clear queues
        }

    })
    .catch(function(error) {
        var msg = config.log.error(context, 'Service could not be start.\n' + error);
        console.trace(msg);
        webhookIO.postToSlack(msg);
        // continue in case its a temporary error
        //process.exit(1);
    });
