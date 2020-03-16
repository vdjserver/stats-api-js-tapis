'use strict';

//
// statsController.js
// Process statistics requests
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

// Server config
var config = require('../config/config');
var mongoSettings = require('../config/mongoSettings');

// Controllers
var apiResponseController = require('./apiResponseController');

// Models
var ServiceAccount = require('../models/serviceAccount');

// Processing
var tapisIO = require('../vendor/tapisIO');

// Node Libraries
var Q = require('q');
var MongoClient = require('mongodb').MongoClient;

var url = 'mongodb://'
    + mongoSettings.hostname + ':27017/' + mongoSettings.dbname;

var StatisticsController = {};
module.exports = StatisticsController;

StatisticsController.RearrangementCount = async function(request, response) {
    if (config.debug) console.log("VDJ-STATS-API INFO: StatisticsController.RearrangementCount");
    console.log(request.body);

    const client = new MongoClient(url);
    try {
        await client.connect();
        if (config.debug) console.log("VDJ-STATS-API INFO: Connected successfully to mongo");

        var v1airr = client.db(mongoSettings.dbname);
        var collection = await v1airr.collection('rearrangement');

        console.log(request.body.repertoires);
        if ((!request.body.repertoires) || (request.body.repertoires.length == 0)) {
            // empty array means total count
            console.log('all');
            var result = await collection.estimatedDocumentCount();
            console.log(result);
            apiResponseController.sendSuccess({"total_count":result}, response);
        } else {
            // otherwise get count for each repertoire
            console.log('list');
            var total_count = 0;
            var rearrangement_count = {};
            for (var i = 0; i < request.body.repertoires.length; ++i) {
                console.log(request.body.repertoires[i]);
                var result = await collection.countDocuments({"repertoire_id":request.body.repertoires[i]});
                console.log(result);
                rearrangement_count[request.body.repertoires[i]] = result;
                total_count += result;
            }
            apiResponseController.sendSuccess({"total_count":total_count,"rearrangement_count":rearrangement_count}, response);
        }
    } catch (err) {
        console.error("VDJ-STATS-API ERROR: Could not connect to database");
        return apiResponseController.sendError("Internal Error", 500, response);
    }
    client.close();
};
