'use strict';

//
// cache-queue.js
// Job queue for the statistics cache
//
// VDJServer Community Data Portal
// Statistics API service
// https://vdjserver.org
//
// Copyright (C) 2021 The University of Texas Southwestern Medical Center
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

var CacheQueue = {};
module.exports = CacheQueue;

// App
var tapisIO = require('vdj-tapis-js');
var tapisSettings = tapisIO.tapisSettings;
var ServiceAccount = tapisIO.serviceAccount;
var webhookIO = require('../vendor/webhookIO');

// Server environment config
var config = require('../config/config');

var Queue = require('bull');
var fs = require('fs');

var triggerQueue = new Queue('Statistics cache trigger');
var createQueue = new Queue('Statistics cache create');
var checkQueue = new Queue('Statistics cache check');
var jobQueue = new Queue('Statistics cache job');
var finishQueue = new Queue('Statistics cache finish');
var clearQueue = new Queue('Statistics cache clear');

CacheQueue.clearQueues = async function(queue) {
    var context = 'CacheQueue.clearQueues';
    var repeatableJobs = await triggerQueue.getRepeatableJobs();
    for (let i in repeatableJobs) {
        await triggerQueue.removeRepeatableByKey(repeatableJobs[i].key);
    }
    config.log.info(context, repeatableJobs.length + ' jobs cleared from triggerQueue', true);

    repeatableJobs = await checkQueue.getRepeatableJobs();
    for (let i in repeatableJobs) {
        await checkQueue.removeRepeatableByKey(repeatableJobs[i].key);
    }
    config.log.info(context, repeatableJobs.length + ' jobs cleared from checkQueue', true);
}

//
// Trigger the cache process
// check and create, if necessary, the statistics_cache metadata singleton.
// This is called by app initialization
//
CacheQueue.triggerCache = async function() {
    var context = 'CacheQueue.triggerCache';
    var msg = null;

    config.log.info(context, 'begin');

    if (! config.enable_cache) {
        msg = config.log.error(context, 'Cache is not enabled in configuration, cannot trigger');
        // TODO: delete any existing cache jobs
        CacheQueue.clearQueues();
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    var stats_cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // create entry if doesn't exist
    if (stats_cache.length == 0) {
        config.log.info(context, 'creating statistics_cache metadata singleton', true);

        // create the stats_cache metadata singleton
        stats_cache = await tapisIO.createStatisticsCache()
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
    } else {
        stats_cache = stats_cache[0];
    }
    config.log.info(context, 'current enable_cache = ' + stats_cache['value']['enable_cache']);

    // stop if not enabled
    if (! stats_cache['value']['enable_cache']) {
        config.log.info(context, 'Statistics cache is not enabled', true);
        CacheQueue.clearQueues();
        return Promise.resolve();
    }

    // trigger the create queue
    config.log.info(context, 'cache enabled, creating queue jobs', true);

    // submit to check every 3600secs/1hour
    triggerQueue.add({stats_cache: stats_cache}, { repeat: { every: 3600000 }});

    // testing, every 2 mins
    //triggerQueue.add({stats_cache: stats_cache}, { repeat: { every: 120000 }});

    // trigger the job queue
    // submit to check every 3600secs/1hour
    //checkQueue.add({stats_cache: stats_cache}, { repeat: { every: 3600000 }});

    // testing, every 10 mins
    checkQueue.add({stats_cache: stats_cache}, { repeat: { every: 600000 }});

    config.log.info(context, 'end');
    return Promise.resolve();
}

// this should run periodically
triggerQueue.process(async (job) => {
    var context = 'triggerQueue';
    var msg = null;

    config.log.info(context, 'Triggering statistics cache queue');

    //console.log(job['data']);

    // nothing running so submit
    var stats_cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    stats_cache = stats_cache[0];

    // verify cache is enabled
    if (stats_cache['value']['enable_cache']) {
        config.log.info(context, 'submitting statistics cache job', true);
        createQueue.add({stats_cache: stats_cache});
    } else {
        config.log.info(context, 'Statistics cache is not enabled', true);
    }

    config.log.info(context, 'end');
    return Promise.resolve();
});

// Statistics cache process
//
// top level job which gathers what is to be cached,
// creates/updates metadata entries for each cached item,
// then submits smaller individual jobs to generate cache contents
//
// 1. Create/update cache entries
// 2. Get next study/repertoire to be cached
// 3. do the caching
//
// we attempt to write in a re-entrant fashion
//
createQueue.process(async (job) => {
    var context = 'createQueue';
    var msg = null;

    config.log.info(context, 'begin statistics cache job');
    //console.log(job['data']);

    // get set of ADC repositories
    var repos = await tapisIO.getSystemADCRepositories()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (!repos || repos.length != 1) {
        msg = config.log.error(context, 'tapisIO.getSystemADCRepositories invalid metadata: ' + repos);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // create/update cache entries for each repository
    repos = repos[0]['value'][config.adcRepositoryEntry];
    //config.log.info(context, repos);
    //console.log(repos);

    for (var repository_id in repos) {
        // only if both download cache and statistics cache is enabled on repository
        if (! repos[repository_id]['enable_cache']) continue;
        if (! repos[repository_id]['enable_statistics_cache']) continue;

        config.log.info(context, 'Statistics cache create job for repository: ' + repository_id, true);

        // get the statistics cache study entries for the repository
        var stats_studies = await tapisIO.getStatisticsCacheStudyMetadata(repository_id)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        config.log.info(context, stats_studies.length + ' statistics cache study entries for repository: ' + repository_id, true);

        // turn into dictionary keyed by study_id
        var stats_studies_dict = {};
        for (let i in stats_studies) {
            let study_id = stats_studies[i]['value']['study_id'];
            if (stats_studies_dict[study_id]) {
                msg = config.log.error(context, 'duplicate study_id: ' + study_id);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            } else stats_studies_dict[study_id] = stats_studies[i];
        }

        // get the download cache study entries for the repository
        var cached_studies = await tapisIO.getStudyCacheEntries(repository_id)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        //console.log(cached_studies);
        config.log.info(context, cached_studies.length + ' statistics cache study entries for repository: ' + repository_id, true);

        // create study cache entries if necessary
        for (let i in cached_studies) {
            let study_id = cached_studies[i]['value']['study_id'];
            //console.log(study_id);
            // TODO: we should check if an existing study has been updated
            if (stats_studies_dict[study_id]) continue;
            
            // insert cache entry
            config.log.info(context, 'ADC study to be cached: ' + study_id, true);
            let cache_entry = await tapisIO.createStatisticsCacheStudyMetadata(repository_id, study_id, cached_studies[i]['uuid'], false)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            config.log.info(context, 'statistics cache entry created for ADC study: ' + study_id, true);
            //console.log(cache_entry);
        }

        // reload with any new entries
        stats_studies = await tapisIO.getStatisticsCacheStudyMetadata(repository_id)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        config.log.info(context, stats_studies.length + ' statistics cache study entries for repository: ' + repository_id, true);

        // create repertoire cache entries if necessary
        for (let i in stats_studies) {
            if (! stats_studies[i]['value']['should_cache']) continue;
            if (stats_studies[i]['value']['is_cached']) continue;
            let study_id = stats_studies[i]['value']['study_id'];

            config.log.info(context, 'Create/Update statistics cache repertoire entries for study: ' + study_id + ' cache_uuid: ' + stats_studies[i]['uuid'], true);

            // get any cached repertoire entries for the study
            var cached_reps = await tapisIO.getRepertoireCacheEntries(repository_id, study_id, null, null, null)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            config.log.info(context, cached_reps.length + ' statistics cache repertoire entries for study: ' + study_id, true);

            // create/update statistics cache entries
            var allCached = true;
            for (let r in cached_reps) {
                var repertoire_id = cached_reps[r]['value']['repertoire_id'];
                var cache_uuid = cached_reps[r]['uuid'];

                // get existing statistics cache entry
                let stats_entry = await tapisIO.getStatisticsCacheRepertoireMetadata(repository_id, study_id, repertoire_id)
                    .catch(function(error) {
                        msg = config.log.error(context, 'error' + error);
                    });
                if (msg) {
                    webhookIO.postToSlack(msg);
                    return Promise.resolve();
                }
                //console.log(stats_entry);

                if (stats_entry.length == 0) {
                    // create cache entry
                    allCached = false;
                    stats_entry = await tapisIO.createStatisticsCacheRepertoireMetadata(repository_id, study_id, repertoire_id, cache_uuid, true)
                        .catch(function(error) {
                            msg = config.log.error(context, 'error' + error);
                        });
                    if (msg) {
                        webhookIO.postToSlack(msg);
                        return Promise.resolve();
                    }
                    config.log.info(context, 'Created statistics cache repertoire entry ' + stats_entry['uuid'] + ' for repertoire: ' + repertoire_id, true);
                } else {
                    // existing entry
                    allCached &= stats_entry[0]['value']['is_cached'];
                    // TODO: we might want to update the existing entry
                    config.log.info(context, 'Existing statistics cache repertoire entry ' + stats_entry[0]['uuid'] + ' for repertoire: ' + repertoire_id, true);
                }
            }
            
            // all repertoires cached so mark study as cached
            if (allCached) {
                config.log.info(context, 'All repertoires cached so marking study as cached: ' + study_id, true);
                stats_studies[i]['value']['is_cached'] = true;
                await tapisIO.updateMetadata(stats_studies[i]['uuid'], stats_studies[i]['name'], stats_studies[i]['value'], null)
                    .catch(function(error) {
                        msg = config.log.error(context, 'error' + error);
                    });
                if (msg) {
                    webhookIO.postToSlack(msg);
                    return Promise.resolve();
                }
            }
        }
    }
    config.log.info(context, 'all cache entries updated');

    config.log.info(context, 'end');
    return Promise.resolve();
});

CacheQueue.pollJobs = async function() {
    var context = 'CacheQueue.pollJobs';
    var msg = null;

    config.log.info(context, 'begin');

    // get repertoires that need statistics with submitted jobs
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata(null, null, null, true, false, null)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    config.log.info(context, stats_entries.length + ' statistics cache repertoires entries needing statistics.', true);

    var with_jobs = [];
    for (let i in stats_entries) {
        let entry = stats_entries[i];
        if (entry['value']['statistics_job_id']) with_jobs.push(entry);
    }

    config.log.info(context, with_jobs.length + ' statistics cache repertoires entries have submitted jobs, checking job statuses.', true);

    if (with_jobs.length == 0) {
        config.log.info(context, 'No statistics jobs so clearing jobs_submitted flag.', true);

        // if no entries with jobs, can clear jobs_submitted flag on statistics cache singleton
        var stats_cache = await tapisIO.getStatisticsCache()
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        stats_cache = stats_cache[0];

        stats_cache['value']['jobs_submitted'] = false;
        await tapisIO.updateMetadata(stats_cache['uuid'], stats_cache['name'], stats_cache['value'], null)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
    } else {
        for (let i in with_jobs) {
            let entry = with_jobs[i];
            let job_entry = await tapisIO.getJobOutput(entry['value']['statistics_job_id'])
            .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            config.log.info(context, 'job ' + entry['value']['statistics_job_id'] + ' has status: '
                + job_entry['status'] + ' for statistics cache repertoires entry: '
                + entry['uuid'], true);

            // call directly instead of posting notification
            if ((job_entry['status'] == 'FINISHED') || (job_entry['status'] == 'FAILED'))
                CacheQueue.finishStatistics(entry['uuid']);
        }
    }

    config.log.info(context, 'end');
    return Promise.resolve();
}

// this should run periodically to check if statistics jobs are to be submitted
checkQueue.process(async (job) => {
    var context = 'checkQueue';
    var msg = null;

    config.log.info(context, 'begin');

    // get statistics cache singleton
    var stats_cache = await tapisIO.getStatisticsCache()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    stats_cache = stats_cache[0];

    // verify cache is enabled
    if (!stats_cache['value']['enable_cache']) {
        config.log.info(context, 'Statistics cache is not enabled', true);
    } else {
        // check if jobs are submitted
        if (stats_cache['value']['jobs_submitted']) {
            config.log.info(context, 'Statistics jobs are already submitted', true);
            await CacheQueue.pollJobs();
        } else {
            config.log.info(context, 'Statistics jobs are not submitted, submit job queue', true);
            jobQueue.add({stats_cache: stats_cache});
        }
    }

    config.log.info(context, 'end');
    return Promise.resolve();
});

// create job data
CacheQueue.createJob = function(uuid, download_cache_id, repertoire_id, maxHours) {
    var context = 'CacheQueue.createJob';
    var msg = null;
    var tapis_path = 'agave://' + tapisSettings.storageSystem + '//community/cache/';

    // TODO: should have similar environment_config.js that GUI uses
    var notify = {
        url: tapisSettings.notifyHost
            + '/irplus/v1/stats/notify/' + uuid
            + '?status=${JOB_STATUS}'
            + '&event=${EVENT}'
            + '&error=${JOB_ERROR}',
        event: '*',
        persistent: true,
        policy: {
            saveOnFailure: true
        }
    };

    var maxTime = Math.floor(maxHours).toString();
    maxTime = maxTime + ':00:00';

    var job_data = {
        name: "statistics cache",
        appId: config.statistics_app,
        batchQueue: config.statistics_app_queue,
        maxRunTime: maxTime,
        nodeCount: 1,
        archive: true,
        archiveSystem: tapisSettings.storageSystem,
        archivePath: '/community/cache/' + download_cache_id + '/statistics/' + repertoire_id,
        inputs: {
            metadata_file: tapis_path + download_cache_id + '/repertoires.airr.json',
            airr_tsv_file: tapis_path + download_cache_id + '/' + repertoire_id + '.airr.tsv.gz',
        },
        parameters: {
            creator: "statistics_cache",
            file_type: "rearrangement",
            repertoire_id: repertoire_id
        },
        notifications: [ notify ]
    };

    return job_data;
};

// submit a set of statistics jobs
jobQueue.process(async (job) => {
    var context = 'jobQueue';
    var msg = null;
    var stats_cache = job['data']['stats_cache'];

    config.log.info(context, 'begin');

    // get repertoires that need statistics (max number of jobs)
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata(null, null, null, true, false, config.statistics_max_jobs)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (stats_entries.length == 0) {
        config.log.info(context, 'No statistics jobs need to be submitted', true);
    } else {
        // update statistics cache singleton to indicate jobs are submitted
        stats_cache['value']['jobs_submitted'] = true;
        await tapisIO.updateMetadata(stats_cache['uuid'], stats_cache['name'], stats_cache['value'], null)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        // submit jobs
        for (let i in stats_entries) {
            let entry = stats_entries[i];
            let repository_id = entry['value']['repository_id'];
            let study_id = entry['value']['study_id'];
            let repertoire_id = entry['value']['repertoire_id'];

            // get the statistics cache study entry
            var stats_study = await tapisIO.getStatisticsCacheStudyMetadata(repository_id, study_id)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            if (!stats_study || stats_study.length != 1) {
                msg = config.log.error(context, 'Incorrect number of statistics cache entries for study: ' + study_id);
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            stats_study = stats_study[0];
            var download_cache_id = stats_study['value']['download_cache_id'];

            config.log.info(context, 'creating statistics cache directory: ' + download_cache_id, true);
            await tapisIO.createCommunityCacheDirectory('statistics', download_cache_id)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            config.log.info(context, 'creating job archive directory for repertoire: ' + repertoire_id, true);
            await tapisIO.createCommunityCacheDirectory(repertoire_id, download_cache_id + '/statistics')
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            var timeMultiplier = entry['value']['timeMultiplier'];
            if (! timeMultiplier) timeMultiplier = 1;
            var maxHours = 1 * timeMultiplier;
            if (maxHours > 48) maxHours = 48;

            var job_data = CacheQueue.createJob(entry['uuid'], download_cache_id, repertoire_id, maxHours);

            //console.log(job_data);
            var job_entry = await tapisIO.launchJob(job_data)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
            config.log.info(context, 'submitted statistics job: ' + job_entry['id'], true);

            //console.log(job_entry);
            // update with job id
            entry['value']['statistics_job_id'] = job_entry['id'];
            await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
        }
    }

    config.log.info(context, 'end');
    return Promise.resolve();
});

//
// After job has calculated the statistics for a repertoire, save them
// and mark as cached.
//
CacheQueue.finishStatistics = function(cache_uuid) {
    var context = 'CacheQueue.finishStatistics';
    config.log.info(context, 'received');
    finishQueue.add({ cache_uuid:cache_uuid });
}

finishQueue.process(async (job) => {
    var context = 'finishQueue';
    var msg = null;
    var cache_uuid = job['data']['cache_uuid'];
    var collection = 'statistics' + tapisSettings.mongo_queryCollection;

    config.log.info(context, 'start');

    // get cache entry
    var entry = await tapisIO.getMetadata(cache_uuid)
        .catch(function(error) {
            msg = config.log.error(context, 'Could not get cache id: ' + cache_uuid + ', error: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! entry) {
        msg = config.log.error(context, 'could not retrieve cache entry: ' + cache_uuid);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    var repository_id = entry['value']['repository_id'];
    var study_id = entry['value']['study_id'];
    var repertoire_id = entry['value']['repertoire_id'];

    // get the statistics cache study entry
    var stats_studies = await tapisIO.getStatisticsCacheStudyMetadata(repository_id, study_id)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (!stats_studies || stats_studies.length != 1) {
        msg = config.log.error(context, 'Incorrect number (!= 1) of statistics cache entries for study: ' + study_id);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    let stats_study = stats_studies[0];
    let download_cache_id = stats_study['value']['download_cache_id'];

    // get the job info
    if (! entry['value']['statistics_job_id']) {
        msg = config.log.error(context, 'No job id for statistics cache repertoire entry, abort finish: ' + entry['uuid']);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    let job_entry = await tapisIO.getJobOutput(entry['value']['statistics_job_id'])
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // only care about the end states
    if ((job_entry['status'] != 'FINISHED') && (job_entry['status'] != 'FAILED')) {
        msg = config.log.error(context, 'Invalid job status (' + job_entry['status'] +') for statistics cache repertoire entry, abort finish: ' + entry['uuid']);
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // if failed, see if recoverable
    if (job_entry['status'] == 'FAILED') {
        msg = config.log.error(context, 'Statistics job failed: ' + job_entry['id']
            + ' for statistics cache repertoires entry: ' + entry['uuid']);
        webhookIO.postToSlack(msg);
        msg = null;

        if (job_entry['lastStatusMessage'].indexOf('TIMEOUT') >= 0) {
            // check if exceeded time and rerun
            if (job_entry['maxHours'] >= 48) {
                msg = config.log.error(context, 'Statistics job: ' + job_entry['id']
                    + ' already ran for 48 hours, disabling statistics');
                webhookIO.postToSlack(msg);
                msg = null;

                entry['value']['should_cache'] = false;
                entry['value']['statistics_job_id'] = null;
                await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
                    .catch(function(error) {
                        msg = config.log.error(context, 'error' + error);
                    });
                if (msg) {
                    webhookIO.postToSlack(msg);
                }
            } else {
                // increase the time multiplier
                var timeMultiplier = entry['value']['timeMultiplier'];
                if (! timeMultiplier) timeMultiplier = 1;
                timeMultiplier *= 2;

                msg = config.log.error(context, 'Retry statistics job with time multiplier: ' + timeMultiplier);
                webhookIO.postToSlack(msg);
                msg = null;

                entry['value']['timeMultiplier'] = timeMultiplier;
                entry['value']['statistics_job_id'] = null;
                await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
                    .catch(function(error) {
                        msg = config.log.error(context, 'error' + error);
                    });
                if (msg) {
                    webhookIO.postToSlack(msg);
                }
            }
        } else {
            // failed for some other reason so disable
            entry['value']['should_cache'] = false;
            entry['value']['statistics_job_id'] = null;
            await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
            }
        }
        return Promise.resolve();
    }

    // should only get to here for a FINISHED job

    // get the rearrangement statistics
    let cache_path = '/community/cache/' + download_cache_id + '/statistics/' + repertoire_id + '/rearrangement_statistics.json';
    var stats_data = await tapisIO.getFileContents(cache_path)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }
    //console.log(stats_data);

    if (! stats_data) {
        // if file is not found, must have been some error in the job, needs manual intervention
        // so disable caching for this repertoire
        msg = config.log.error(context, 'rearrangement_statistics.json file not found for cache_uuid: ' + entry['uuid']
                              + ', likely an error within job: ' + entry['value']['statistics_job_id']
                              + ', disabling statistics cache for repertoire');
        webhookIO.postToSlack(msg);

        entry['value']['should_cache'] = false;
        await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
                webhookIO.postToSlack(msg);
            });
        return Promise.resolve();
    }

    // verify it is valid JSON
    let data = null;
    try {
        data = JSON.parse(stats_data);
        if (! data)
            msg = config.log.error(context, 'Empty rearrangement statistics JSON for cache_uuid: ' + entry['uuid']);
    } catch {
        msg = config.log.error(context, 'Invalid rearrangement statistics JSON for cache_uuid: ' + entry['uuid']);
    }
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (! data) {
        // if invalid JSON, must have been some error in the job, needs manual intervention
        // so disable caching for this repertoire
        msg = config.log.error(context, 'Invalid rearrangement statistics JSON for cache_uuid: ' + entry['uuid']
                              + ', likely an error within job: ' + entry['value']['statistics_job_id']
                              + ', disabling statistics cache for repertoire');
        webhookIO.postToSlack(msg);

        entry['value']['should_cache'] = false;
        await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
                webhookIO.postToSlack(msg);
            });
        return Promise.resolve();
    }

    // save the statistics
    await tapisIO.recordStatistics(collection, data)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // update the metadata
    entry['value']['is_cached'] = true;
    await tapisIO.updateMetadata(entry['uuid'], entry['name'], entry['value'], null)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    config.log.info(context, 'end');
    return Promise.resolve();
});

//
// Clear the statistics cache
//
CacheQueue.triggerClearCache = function(cache_uuid) {
    var context = 'CacheQueue.triggerClearCache';
    config.log.info(context, 'start');
    clearQueue.add({ cache_uuid:cache_uuid });
}

clearQueue.process(async (job) => {
    var context = 'clearQueue';
    var msg = null;
    var cache_uuid = job['data']['cache_uuid'];
    var collection = 'statistics' + tapisSettings.mongo_queryCollection;

    config.log.info(context, 'start');

    // get cache entry
    var metadata = await tapisIO.getMetadata(cache_uuid)
        .catch(function(error) {
            msg = config.log.error(context, 'Could not get metadata id: ' + cache_uuid + ', error: ' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    var repository_id = metadata['value']['repository_id'];
    var study_id = metadata['value']['study_id'];
    var repertoire_id = null;
    if (metadata['name'] == 'statistics_cache_study') {
        // clear study cache
        config.log.info(context, 'clear statistics cache for repository: ' + repository_id + ' and study: ' + study_id);
    } else if (metadata['name'] == 'statistics_cache_repertoire') {
        // clear repertoire cache
        repertoire_id = metadata['value']['repertoire_id'];
        config.log.info(context, 'clear statistics cache for repository: ' + repository_id + ' and study: ' + study_id
            + ' and repertoire: ' + repertoire_id);
    } else {
        msg = config.log.error(context, 'Metadata id: ' + cache_uuid + ' is not statistics_cache_study or statistics_cache_repertoire');
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    // get the statistics cache study entries
    var stats_studies = await tapisIO.getStatisticsCacheStudyMetadata(repository_id, study_id)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    config.log.info(context, stats_studies.length + ' statistics cache study entries to be cleared.', true);

    // get statistics cache repertoire entries
    let stats_entries = await tapisIO.getStatisticsCacheRepertoireMetadata(repository_id, study_id, repertoire_id)
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    config.log.info(context, stats_entries.length + ' statistics cache repertoires entries to be cleared.', true);

    // get service token
    await ServiceAccount.getToken()
        .catch(function(error) {
            msg = config.log.error(context, 'error' + error);
        });
    if (msg) {
        webhookIO.postToSlack(msg);
        return Promise.resolve();
    }

    if (repertoire_id) {
        // clear statistics for one repertoire
        if (!stats_studies || stats_studies.length != 1) {
            msg = config.log.error(context, 'Incorrect number (!= 1) of statistics cache entries for study: ' + study_id);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        let stats_study = stats_studies[0];
        let download_cache_id = stats_study['value']['download_cache_id'];

        if (!stats_entries || stats_entries.length != 1) {
            msg = config.log.error(context, 'Incorrect number (!= 1) of statistics cache repertoire entries for repertoire: ' + repertoire_id);
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
        let entry = stats_entries[0];

        // delete the statistics cache directory for repertoire
        let cache_path = '/community/cache/' + download_cache_id + '/statistics/' + repertoire_id;
        config.log.info(context, 'Deleting statistics directory: ' + cache_path, true);
        await tapisIO.deleteFile(cache_path)
            .catch(function(error) {
                msg = config.log.error(context, 'tapisIO.deleteFile, error ' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        // delete the statistics data in the database
        await tapisIO.deleteStatistics(collection, repertoire_id, null)
            .catch(function(error) {
                msg = config.log.error(context, 'tapisIO.deleteStatistics: ' + repertoire_id + ', error ' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        // delete the repertoire entry
        await tapisIO.deleteMetadata(ServiceAccount.accessToken(), entry['uuid'])
            .catch(function(error) {
                msg = config.log.error(context, 'tapisIO.deleteMetadata: ' + entry['uuid'] + ', error ' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }

        // update study entry
        stats_study['value']['is_cached'] = false;
        await tapisIO.updateMetadata(stats_study['uuid'], stats_study['name'], stats_study['value'], null)
            .catch(function(error) {
                msg = config.log.error(context, 'error' + error);
            });
        if (msg) {
            webhookIO.postToSlack(msg);
            return Promise.resolve();
        }
    } else {
        // clearing for one or more studies
        for (let i in stats_studies) {
            let stats_study = stats_studies[i];
            let download_cache_id = stats_study['value']['download_cache_id'];

            // delete the whole study cache directory
            let cache_path = '/community/cache/' + download_cache_id + '/statistics';
            config.log.info(context, 'Deleting statistics directory: ' + cache_path, true);
            await tapisIO.deleteFile(cache_path)
                .catch(function(error) {
                    msg = config.log.error(context, 'tapisIO.deleteFile, error ' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
        }

        // delete all the repertoire entries
        for (let i in stats_entries) {
            let entry = stats_entries[i];

            await tapisIO.deleteStatistics(collection, entry['value']['repertoire_id'], null)
                .catch(function(error) {
                    msg = config.log.error(context, 'tapisIO.deleteStatistics: ' + repertoire_id + ', error ' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }

            await tapisIO.deleteMetadata(ServiceAccount.accessToken(), entry['uuid'])
                .catch(function(error) {
                    msg = config.log.error(context, 'tapisIO.deleteMetadata: ' + entry['uuid'] + ', error ' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
        }

        // update the study entries
        for (let i in stats_studies) {
            let stats_study = stats_studies[i];
            stats_study['value']['is_cached'] = false;
            await tapisIO.updateMetadata(stats_study['uuid'], stats_study['name'], stats_study['value'], null)
                .catch(function(error) {
                    msg = config.log.error(context, 'error' + error);
                });
            if (msg) {
                webhookIO.postToSlack(msg);
                return Promise.resolve();
            }
        }
    }

    config.log.info(context, 'complete');
    return Promise.resolve();
});
