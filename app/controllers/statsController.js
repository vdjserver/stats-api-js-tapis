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

var StatisticsController = {};
module.exports = StatisticsController;

// Server config
var config = require('../config/config');

// Tapis
var tapisSettings = require('vdj-tapis-js/tapisSettings');
var tapisIO = tapisSettings.get_default_tapis();
var ServiceAccount = tapisIO.serviceAccount;
var GuestAccount = tapisIO.guestAccount;
var authController = tapisIO.authController;
var webhookIO = require('vdj-tapis-js/webhookIO');

// Controllers
var apiResponseController = require('./apiResponseController');

// Queues
var statisticsQueue = require('../queues/cache-queue');

// rearrangement counts
StatisticsController.RearrangementCount = async function(request, response) {
    var context = 'StatisticsController.RearrangementCount';
    var msg = null;

    var repertoire_list = request.body.repertoires;
    var statistics_list = request.body.statistics;
    var collection = 'statistics' + tapisSettings.mongo_queryCollection;

    if (! statistics_list) return response.status(200).json({ Info: config.info, Result: [] });
    if (statistics_list.length == 0) return response.status(200).json({ Info: config.info, Result: [] });

    // construct query
    // TODO: ignoring data_processing_id and sample_processing_id
    var filter = null;
    var id_list = [];
    if (repertoire_list) {
        for (let i in repertoire_list)
            if (repertoire_list[i]['repertoire'])
                if (repertoire_list[i]['repertoire']['repertoire_id'])
                    id_list.push(repertoire_list[i]['repertoire']['repertoire_id']);
    }
    // an empty repertoire list implies all repertoires
    if (id_list.length > 0) {
        filter = { 'repertoire.repertoire_id': { '$in': id_list }};
    }
    //var query = null;
    //if (filter) query = JSON.stringify(filter);
    config.log.info(context, 'Query is: ' + JSON.stringify(filter));

    var projection = {};
    projection['repertoire'] = 1;
    projection['_id'] = 0;
    if (statistics_list)
        for (let i in statistics_list) projection[statistics_list[i]] = 1;

    // get the statistics
    var records = await tapisIO.performMultiQuery(collection, filter, projection, 1, tapisSettings.max_size)
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // reformat the response
    var results = [];
    for (let i in records) {
        let entry = { repertoire: records[i]['repertoire'], statistics: [] };
        for (let j in statistics_list) {
            if (records[i][statistics_list[j]])
                entry['statistics'].push(records[i][statistics_list[j]]);
        }
        results.push(entry);
    }

    return response.status(200).json({ Info: config.info, Result: results });
};

// rearrangement junction lengths
StatisticsController.RearrangementJunctionLength = async function(request, response) {
    var context = 'StatisticsController.RearrangementJunctionLength';
    var msg = null;

    var repertoire_list = request.body.repertoires;
    var statistics_list = request.body.statistics;
    var collection = 'statistics' + tapisSettings.mongo_queryCollection;

    if (! statistics_list) return response.status(200).json({ Info: config.info, Result: [] });
    if (statistics_list.length == 0) return response.status(200).json({ Info: config.info, Result: [] });

    // construct query
    // TODO: ignoring data_processing_id and sample_processing_id
    var filter = null;
    var id_list = [];
    if (repertoire_list) {
        for (let i in repertoire_list)
            if (repertoire_list[i]['repertoire'])
                if (repertoire_list[i]['repertoire']['repertoire_id'])
                    id_list.push(repertoire_list[i]['repertoire']['repertoire_id']);
    }
    // an empty repertoire list implies all repertoires
    if (id_list.length > 0) {
        filter = { 'repertoire.repertoire_id': { '$in': id_list }};
    }
    //var query = null;
    //if (filter) query = JSON.stringify(filter);
    config.log.info(context, 'Query is: ' + JSON.stringify(filter));

    var projection = {};
    projection['repertoire'] = 1;
    projection['_id'] = 0;
    if (statistics_list)
        for (let i in statistics_list) projection[statistics_list[i]] = 1;

    // get the statistics
    var records = await tapisIO.performMultiQuery(collection, filter, projection, 1, tapisSettings.max_size)
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // reformat the response
    var results = [];
    for (let i in records) {
        let entry = { repertoire: records[i]['repertoire'], statistics: [] };
        for (let j in statistics_list) {
            if (records[i][statistics_list[j]])
                entry['statistics'].push(records[i][statistics_list[j]]);
        }
        results.push(entry);
    }

    return response.status(200).json({ Info: config.info, Result: results });
};

// rearrangement gene usage
StatisticsController.RearrangementGeneUsage = async function(request, response) {
    var context = 'StatisticsController.RearrangementGeneUsage';
    var msg = null;

    var repertoire_list = request.body.repertoires;
    var statistics_list = request.body.statistics;
    var collection = 'statistics' + tapisSettings.mongo_queryCollection;

    if (! statistics_list) return response.status(200).json({ Info: config.info, Result: [] });
    if (statistics_list.length == 0) return response.status(200).json({ Info: config.info, Result: [] });

    // construct query
    // TODO: ignoring data_processing_id and sample_processing_id
    var filter = null;
    var id_list = [];
    if (repertoire_list) {
        for (let i in repertoire_list)
            if (repertoire_list[i]['repertoire'])
                if (repertoire_list[i]['repertoire']['repertoire_id'])
                    id_list.push(repertoire_list[i]['repertoire']['repertoire_id']);
    }
    // an empty repertoire list implies all repertoires
    if (id_list.length > 0) {
        filter = { 'repertoire.repertoire_id': { '$in': id_list }};
    }
    //var query = null;
    //if (filter) query = JSON.stringify(filter);
    config.log.info(context, 'Query is: ' + JSON.stringify(filter));

    var projection = {};
    projection['repertoire'] = 1;
    projection['_id'] = 0;
    if (statistics_list)
        for (let i in statistics_list) projection[statistics_list[i]] = 1;

    // get the statistics
    var records = await tapisIO.performMultiQuery(collection, filter, projection, 1, tapisSettings.max_size)
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // reformat the response
    var results = [];
    for (let i in records) {
        let entry = { repertoire: records[i]['repertoire'], statistics: [] };
        for (let j in statistics_list) {
            if (records[i][statistics_list[j]])
                entry['statistics'].push(records[i][statistics_list[j]]);
        }
        results.push(entry);
    }

    return response.status(200).json({ Info: config.info, Result: results });
};

// clone counts
StatisticsController.CloneCount = async function(request, response) {
    if (config.debug) console.log("VDJ-STATS-API INFO: StatisticsController.CloneCount");

    return apiResponseController.notImplemented(request, response);
};

//
// Admin
//

// singleton statistics cache status
StatisticsController.getStatisticsCacheStatus = async function(request, response) {
    var context = 'StatisticsController.getStatisticsCacheStatus';
    var msg = null;

    // get list from metadata
    var cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    if (cache && cache.length == 1) {
        return response.status(200).json(cache[0]['value']);
    } else {
        msg = config.log.error(context, 'Could not retrieve statistics_cache entry.');
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }
};

// update statistics cache status
StatisticsController.updateStatisticsCacheStatus = async function(request, response) {
    var context = 'StatisticsController.updateStatisticsCacheStatus';
    var msg = null;
    var operation = request.body.operation;

    // get singleton metadata entry
    var cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    if (cache && cache.length == 1) {
        var value = cache[0]['value'];
        config.log.info(context, 'current enable_cache = ' + value['enable_cache']);

        if (operation == 'enable') value['enable_cache'] = true;
        if (operation == 'disable') value['enable_cache'] = false;
        if (operation == 'trigger') value['enable_cache'] = true;

        // update
        await tapisIO.updateDocument(cache[0]['uuid'], cache[0]['name'], value)
            .catch(function(error) {
                msg = config.log.error(context, 'Error while updating: ' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return response.status(500).json({"message":msg});
        }

        if (operation == 'disable') {
            // clear the queue jobs
            statisticsQueue.clearQueues();
        }

        if (operation == 'trigger') {
            // trigger the process
            statisticsQueue.triggerCache();
        }

        config.log.info(context, 'updated enable_cache = ' + value['enable_cache']);
        response.status(200).json({"message":"Updated."});
    } else {
        msg = config.log.error(context, 'could not retrieve metadata entry.');
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }
};

// list statistics cache study entries
StatisticsController.getStatisticsCacheStudyList = async function(request, response) {
    var context = 'StatisticsController.getStatisticsCacheStudyList';
    var msg = null;

    // get list, hard-coded to vdjserver repository
    var cached_studies = await tapisIO.getStatisticsCacheStudyMetadata('vdjserver')
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // clean up the output results
    var results = [];
    for (var i in cached_studies) {
        var entry = cached_studies[i]['value'];
        entry['cache_uuid'] = cached_studies[i]['uuid'];
        results.push(entry);
    }

    return response.status(200).json(results);
};

// update statistics cache for study
StatisticsController.updateStatisticsCacheForStudy = async function(request, response) {
    var context = 'StatisticsController.updateStatisticsCacheForStudy';
    var msg = null;

    var cache_uuid = request.params.cache_uuid;
    var should_cache = request.body.should_cache;
    var reload = request.body.reload;

    config.log.info(context, 'Update statistics study cache with cache uuid: ' + cache_uuid);

    // is there a cache record?
    var metadata = await tapisIO.getMetadata(cache_uuid)
        .catch(function(error) {
            msg = config.log.error(context, 'Could not get cache uuid: ' + cache_uuid + ', error: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    if (! metadata) {
        msg = config.log.error(context, 'could not retrieve cache entry.');
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    // valid type?
    if (metadata['name'] != 'statistics_cache_study') {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' is not statistics_cache_study');
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    // update
    metadata['value']['should_cache'] = should_cache;
    await tapisIO.updateMetadata(metadata['uuid'], metadata['name'], metadata['value'], null)
        .catch(function(error) {
            msg = config.log.error(context, 'Error while updating: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // trigger reload if requested
    if (reload) statisticsQueue.triggerReloadCache(metadata['uuid']);

    response.status(200).json({"message":"Updated."});
};

// update statistics cache for repertoire
StatisticsController.updateStatisticsCacheForRepertoire = async function(request, response) {
    var context = 'StatisticsController.updateStatisticsCacheForRepertoire';
    var msg = null;
    var repertoire_id = request.params.repertoire_id;
    var should_cache = request.body.should_cache;

    config.log.info(context, 'Update statistics cache for repertoire id: ' + repertoire_id);

    // is there a cache record?
    // we assume vdjserver repository, unknown study
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata('vdjserver', null, repertoire_id)
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // repertoire_id is unique, so should only be one
    if (!stats_entries || stats_entries.length != 1) {
        msg = config.log.error(context, 'Could not retrieve cache entry for repertoire: ' + repertoire_id);
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }
    let entry = stats_entries[0];

    // update
    entry['value']['should_cache'] = should_cache;
    await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
        .catch(function(error) {
            msg = config.log.error(context, 'Error while updating: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    response.status(200).json({"message":"Updated."});
};

// clear statistics cache for a single study
// this doesn't disable caching but does set is_cached to false
StatisticsController.clearStudyCache = async function(request, response) {
    var context = 'StatisticsController.clearStudyCache';
    var msg = null;
    var cache_uuid = request.params.cache_uuid;

    config.log.info(context, 'Clear statistics study cache for cache uuid: ' + cache_uuid);

    // is there a cache record?
    var metadata = await tapisIO.getMetadata(cache_uuid)
        .catch(function(error) {
            msg = config.log.error(context, 'Could not get cache uuid: ' + cache_uuid + ', error: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    if (! metadata) {
        msg = config.log.error(context, 'could not retrieve cache entry.');
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    // valid type?
    if (metadata['name'] != 'statistics_cache_study') {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' is not statistics_cache_study');
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }

    // clear it
    config.log.info(context, 'Clearing statistics study cache for cache_uuid: ' + metadata['uuid']);
    statisticsQueue.triggerClearCache(metadata['uuid']);

    // return a response
    response.status(200).json({"message":"study cache clear has been queued."});
};

// clear statistics cache for a single repertoire
// this doesn't disable caching but does set is_cached to false
StatisticsController.clearRepertoireCache = async function(request, response) {
    var context = 'StatisticsController.clearRepertoireCache';
    var msg = null;
    var repertoire_id = request.params.repertoire_id;

    config.log.info(context, 'Clear statistics cache for repertoire id: ' + repertoire_id);

    // is there a cache record?
    // we assume vdjserver repository, unknown study
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata('vdjserver', null, repertoire_id)
        .catch(function(error) {
            msg = config.log.error(context, 'Error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return response.status(500).json({"message":msg});
    }

    // repertoire_id is unique, so should only be one
    if (!stats_entries || stats_entries.length != 1) {
        msg = config.log.error(context, 'Could not retrieve metadata entry for repertoire: ' + repertoire_id);
        webhookIO.postToSlack(msg);
        return response.status(400).json({"message":msg});
    }
    let entry = stats_entries[0];

    // clear it
    config.log.info(context, 'Clearing statistics cache for cache_uuid: ' + entry['uuid']);
    statisticsQueue.triggerClearCache(entry['uuid']);

    // return a response
    response.status(200).json({"message":"cache clear has been queued."});
};

// receive notification from Tapis job
StatisticsController.statsNotify = async function(req, res) {
    var context = 'StatisticsController.statsNotify';
    var msg = null;
    var cache_uuid = req.params.cache_uuid;
    var job_status = req.query.status;
    var job_event = req.query.event;
    var job_error = req.query.error;

    config.log.info(context, 'Received statistics job notification id: ' + cache_uuid
                    + ', status: ' + job_status + ', event: ' + job_event + ', error: ' + job_error);

    // return a response
    res.status(200).json({"message":"notification received."});

    // only care about the end states
    if ((job_status != 'FINISHED') && (job_status != 'FAILED'))
        return Promise.resolve();

    // search for metadata item based on notification id
    var metadata = await tapisIO.getMetadata(cache_uuid)
        .catch(function(error) {
            msg = config.log.error(context, 'Could not get cache uuid: ' + cache_uuid + ', error: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // verify that metadata is valid, owned by vdj, job had error?
    if (! metadata) {
        msg = config.log.error(context, 'could not retrieve cache entry.');
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // valid type?
    if (metadata['name'] != 'statistics_cache_repertoire') {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' is not statistics_cache_repertoire');
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // have job?
    if (! metadata['value']['statistics_job_id']) {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' does not have statistics job id');
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // check job
    let job_entry = await tapisIO.getJobOutput(metadata['value']['statistics_job_id'])
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! job_entry) {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' has invalid statistics job id: ' + metadata['value']['statistics_job_id']);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // correct job status?
    if (job_entry['status'] != job_status) {
        msg = config.log.error(context, 'Cache uuid: ' + cache_uuid + ' has job status that does not match notification,  '
                               + job_entry['status'] + ' != ' + job_status);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // submit finish queue job to cache statistics
    statisticsQueue.finishStatistics(cache_uuid);

    return Promise.resolve();
}
