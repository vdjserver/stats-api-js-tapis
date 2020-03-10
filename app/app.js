'use strict';

//
// app.js
// Application entry point
//
// VDJServer Community Data Portal
// http://vdjserver.org
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

// Express Modules
var express      = require('express');
var errorHandler = require('errorhandler');
var bodyParser   = require('body-parser');
var openapi      = require('express-openapi');
var _            = require('underscore');
var path = require('path');
var fs = require('fs');
var app          = module.exports = express();


// Verify we can login to Tapis with service account
var ServiceAccount = require('./models/serviceAccount');
ServiceAccount.getToken()
    .then(function(serviceToken) {
        console.log('IRPLUS-API INFO: Successfully acquired service token.');
    })
    .fail(function(error) {
        console.error('IRPLUS-API ERROR: Service may need to be restarted.');
        webhookIO.postToSlack('IRPLUS-API ERROR: Unable to login with service account.\nSystem may need to be restarted.\n' + error);
        //process.exit(1);
    });

// Controllers
var apiResponseController = require('./controllers/apiResponseController');
var statsController    = require('./controllers/statsController');

// Server Options
var config = require('./config/config');
app.set('port', config.port);
app.set('sslOptions', config.sslOptions);

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
app.use(allowCrossDomain);

app.use(errorHandler({
    dumpExceptions: true,
    showStack: true,
}));

openapi.initialize({
  apiDoc: fs.readFileSync(path.resolve(__dirname, '../specs/stats-api.yaml'), 'utf8'),
  app: app,
  promiseMode: true,
  consumesMiddleware: {
    'application/json': bodyParser.json(),
    'application/x-www-form-urlencoded': bodyParser.urlencoded({extended: true})
  },
  operations: {
      get_service_status: apiResponseController.confirmUpStatus,
      rearrangement_count: statsController.RearrangementCount
  }
});

app.listen(app.get('port'), function() {
    console.log('VDJ-STATS-API INFO: VDJServer Statistics API service listening on port ' + app.get('port'));
});
