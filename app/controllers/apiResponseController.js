'use strict';

//
// apiResponseController.js
// Standard API responses
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

var ApiResponseController = {};
module.exports = ApiResponseController;

var config = require('../config/config');
var webhookIO = require('../vendor/webhookIO');

// service status
ApiResponseController.confirmUpStatus = function(request, response) {
    // Verify we can login with service account
    var ServiceAccount = require('../models/serviceAccount');
    ServiceAccount.getToken()
        .then(function(token) {
            response.status(200).json({"message":"success"});
        })
        .catch(function(error) {
            var msg = 'VDJServer STATS API ERROR (confirmUpStatus): Could not acquire service token.\n.' + error;
            response.status(500).json({"message":msg});
            console.error(msg);
            webhookIO.postToSlack(msg);
        });
}

// service info
ApiResponseController.getInfo = function(request, response) {
    // Respond with service info
    response.status(200).json(config.info);
}

// not implemented stub
ApiResponseController.notImplemented = function(request, response) {
    response.status(500).json({"message":"Not implemented."});
}
