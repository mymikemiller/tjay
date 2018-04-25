var {google} = require('googleapis');
var youtubedl = require('youtube-dl');
var service = google.youtube('v3');

// Set debugHistory to null to actually search the user's history. 
// To skip that lengthy process (roughly 2.5 minutes), set to an array of videoIds.      
var debugHistory = null // [ 'pxW7HI9BDn8', '16Gd4U_aGyE' ] // null


// The number of videos from the history that should be scraped to figure out which videos to remove from the playlist.
var numHistoryVideosToScrape = 100

module.exports = function(auth) {
    var module = {};
    
    module.removeWatched = function () {
        // Figure out which videos we need to remove from the playlist.
        var getHistoryPromise = getHistory(numHistoryVideosToScrape)

        // GameGrumps: PL3vjEigRnnkCAWsSJPYSotyKHBC0v2irO
        // GameGrumps_bak: PL3vjEigRnnkAos_0IqWd7_Pg1Sp07aXr8
        // Get the video info, which includes the id within the playlist (we need that for deletion)
        var getPlaylistItemsPromise = getPlaylistItems('PL3vjEigRnnkCAWsSJPYSotyKHBC0v2irO')

        Promise.all([getHistoryPromise, getPlaylistItemsPromise]).then(function(values) {
            var watchedVideoIds = values[0]
            var playlistItems = values[1]

            let playlistItemsToRemove = getPlaylistItemsToRemove(playlistItems, watchedVideoIds)

            removeAllFromPlaylist(playlistItemsToRemove)
        }).catch(function(err) {
            console.log("Error: " + err)
        })
    };

    function getHistory(numVideoIdsToGet) {
        return new Promise(function(resolve, reject) {

            // If we've set up a debug history to use, simply return that instead of using youtubedl, which takes a while.
            if (debugHistory) return resolve(debugHistory);

            console.log("Scraping youtube history. This may take a while...")

            // This uses the ~/.netrc file for the username and password for Google
            youtubedl.getInfo(":ythistory", ['--netrc', '--flat-playlist', '--playlist-end=' + numVideoIdsToGet], function(err, info) {
                if (err) {
                    reject(err);
                } else {
                    // Pull the video ids out of the returned history info
                    resolve(info.map(element => element.id))
                }
            });  
        })
    };

    function getPlaylistItems(playlistId) {
        return new Promise(function(resolve, reject) {
            service.playlistItems.list({
                'auth': auth,
                'maxResults': '25',
                'part': 'snippet,contentDetails',
                'playlistId': playlistId}
            , function(err, response) {
                if (err) {
                    console.log('The API returned an error: ' + err);
                    reject(err)
                    return;
                }
                resolve(response.data.items)
            });
        })
    }

    function getPlaylistItemsToRemove(playlistItems, watchedVideoIds) {
        // Remove consecutive watched playlistItems from the beginning of the list, leaving the last one
        
        var playlistItemsToRemove = []

        //.some short-curcuits when 'true' is returned (can't break out from a .forEach early)
        // This will add all watched videos to the remove list, we'll remove the most recently 
        // watched video from this list just in case the last video wasn't watched completely
        playlistItems.some(function(item) {
            let videoId = item.contentDetails.videoId
            let wasWatched = watchedVideoIds.includes(videoId)

            console.log("considering " + videoId)

            // Break at the first non-watched video
            if (!wasWatched) {
                return true
            }
            playlistItemsToRemove.push(item)
            return false
        })

        // Now we need to remove the last item from the list so we leave one potentially partially watched video in the list
        playlistItemsToRemove.pop()

        console.log("playlistItemsToRemove:")
        playlistItemsToRemove.forEach((item) => {
            console.log(item.contentDetails.videoId)
        })

        return playlistItemsToRemove.reverse()
    }

    function removeAllFromPlaylist(playlistItemsToRemove) {
        removeNextItem(playlistItemsToRemove)
    }

    function removeNextItem(itemsLeftToRemove) {
        console.log("removeNextItem from ")
        itemsLeftToRemove.forEach(it => {
            console.log("  " + it.contentDetails.videoId)
        })
        if (itemsLeftToRemove.length == 0) {
            // Done processing
            console.log("done deleting")
            return
        }

        // We use shift() here because we want to remove starting with the first item in the playlist
        var item = itemsLeftToRemove.shift()
        console.log("Deleting from playlist: " + item.contentDetails.videoId)
        removeItemFromPlaylist(item, (removedPlaylistItem) => {
            //console.log("Deleted" + removedPlaylistItem.contentDetails.videoId)
            removeNextItem(itemsLeftToRemove)
        })
    }

    function removeItemFromPlaylist(playlistItem, next) {
        console.log("removeItemFromPlaylist: " + playlistItem.contentDetails.videoId)
        service.playlistItems.delete({
            'auth': auth,
            'id': playlistItem.id}
        , function(err, response) {
            console.log("Done deleting " + playlistItem.contentDetails.videoId)
            if (err) {
                console.log('The API returned an error: ' + err);
                reject(err)
                return;
            }
            next(playlistItem)
        });
    }

    return module;
};