/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/**
 * @module twitter-account
 * @license MPL-2.0
 */
"use strict";

const twitter = require("twitter-text");
const fetch = require("fetch-base64");
const pagination = require("./pagination");
const Twitter = require("twitter");
const self = require("../self");
const ContentAccount = require("./content-account");
const TwitterFormatter = require("../formatters/twitter");

/**
 * @fires module:twitter-account.TwitterAccount#mention
 * @this module:twitter-account.TwitterAccount
 * @param {string?} lastMention - ID of the latest mention.
 * @returns {string} ID of the latest mention.
 */
async function getMentions(lastMention) {
    await this.ready;
    const args = {
        count: 200,
        tweet_mode: "extended"
    };
    if(lastMention !== undefined) {
        args.since_id = lastMention;
    }
    const tweets = await this.tweets;
    const res = await pagination.twitter((params) => this._twitterClient.get('statuses/mentions_timeline', params), args);
    if(res.length > 0) {
        const oldestTweet = Date.parse(tweets.length ? tweets.slice().pop().created_at : Date.now());
        for(const tweet of res) {
            //TODO filter replies in a thread from the same side, so you only get one issue for longer replies.
            if(Date.parse(tweet.created_at) > oldestTweet && tweets.every((t) => t.in_reply_to_status_id_str !== tweet.id_str)) {
                this.emit("mention", tweet);
            }
        }
        return res[0].id_str;
    }
    return lastMention;
}
getMentions.emitsEvents = true;

/**
 * @this module:twitter-account.TwitterAccount
 * @param {[Object]} [tweets=[]] - Previous tweets.
 * @returns {[Object]} Updated list of tweets.
 */
async function getTweets(tweets = []) {
    await this.ready;
    const args = {
        user_id: await this.getID(),
        exclude_replies: false,
        include_rts: true,
        count: 200,
        tweet_mode: "extended"
    };
    if(tweets.length) {
        args.since_id = tweets[0].id_str;
    }
    const result = await pagination.twitter((params) => this._twitterClient.get('statuses/user_timeline', params), args);
    if(result.length) {
        return result.concat(tweets);
    }
    return tweets;
}

/**
 * A new mention of the twitter account was found. Holds the raw tweet from the API.
 *
 * @event module:twitter-account.TwitterAccount#mention
 * @type {Object}
 */

/**
 * @alias module:twitter-account.TwitterAccount
 * @extends module:accounts/content-account.ContentAccount
 */
class TwitterAccount extends ContentAccount {
    static get Formatter() {
        return TwitterFormatter;
    }

    /**
     * @param {Object} config - Twitter client config.
     * @param {Twitter} [client] - Twitter client to use for testing.
     */
    constructor(config, client) {
        super({
            lastMention: getMentions,
            tweets: getTweets
        });
        /**
         * @type {external:Twitter}
         * @private
         */
        this._twitterClient = client ? client : new Twitter(config);
        /**
         * @type {Promise}
         */
        this.ready = this.checkLogin().catch((e) => {
            console.error("TwitterAccount checkLogin", e);
            throw e;
        });
    }

    /**
     * Extract the Tweet id from the url if it's a valid tweet URL.
     *
     * @param {string} tweetUrl - URL to the tweet.
     * @returns {string?} If possible the ID of the tweet is returned.
     */
    static getTweetIDFromURL(tweetUrl) {
        const matches = tweetUrl.match(/^https?:\/\/(?:www\.)?twitter.com\/[^/]+\/status\/([0-9]+)\/?$/);
        return (matches && matches.length > 1) ? matches[1] : null;
    }

    static getUserFromURL(tweetUrl) {
        const matches = tweetUrl.match(/^https?:\/\/(?:www\.)?twitter.com\/([^/]+)\/status\/[0-9]+\/?$/);
        return (matches && matches.length > 1) ? matches[1] : null;
    }

    /**
     * @param {string} content - Content of the tweet to get the count for.
     * @returns {number} Estimated amount of remaining characters for the tweet.
     * @throws {Error} When the tweet contains too many images.
     * @todo Convert to percentage/permill based indication
     */
    static getRemainingChars(content) {
        const [ pureTweet ] = this.getMediaAndContent(content);
        const parsedTweet = twitter.parseTweet(pureTweet);
        return 280 - parsedTweet.weightedLength;
    }

    /**
     * Checks if the content of a tweet is too long.
     *
     * @param {string} content - Content of the tweet to check.
     * @returns {boolean} Whether the tweet content is too long.
     * @throws {Error} When the tweet contains too many images.
     */
    static tweetTooLong(content) {
        const charCount = this.getRemainingChars(content);
        return charCount < 0;
    }

    /**
     * Checks if the tweet content is valid.
     *
     * @param {string} content - Content of the tweet to check.
     * @returns {boolean} Wether the tweet is valid.
     * @throws {Error} When the tweet contains too many images.
     */
    static tweetValid(content) {
        const [ pureTweet ] = this.getMediaAndContent(content);
        const parsedTweet = twitter.parseTweet(pureTweet);
        return parsedTweet.valid;
    }

    /**
     * Separate media and text content of a tweet authored in GitHub Flavoured
     * Markdown.
     *
     * @param {string} tweet - Content of the tweet.
     * @returns {[string, [string]]} An array with the first item being the
     *          cleaned up text content and the second item being an array of
     *          media item URLs.
     * @throws {Error} When more than 4 images are given, as Twitter only
     *         supports up to 4 images.
     */
    static getMediaAndContent(tweet) {
        if(tweet.search(/!\[[^\]]*\]\([^)]+\)/) !== -1) {
            const media = [];
            const pureTweet = tweet.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (match, url) => {
                media.push(url);
                return '';
            });
            if(media.length > 4) {
                throw new Error("Can not upload more than 4 images per tweet");
            }
            return [ pureTweet.trim(), media ];
        }
        return [ tweet.trim(), [] ];
    }

    static makeTweetPermalink(username, id) {
        return `https://twitter.com/${username}/status/${id}`;
    }

    async getAccountLink() {
        const username = await this.getUsername();
        return `[@${username}](https://twitter.com/${username})`;
    }

    /**
     * Upload an image to Twitter and get its media id.
     *
     * @param {string} mediaUrl - URL of the image to upload.
     * @returns {string} Media ID of the image on Twitter.
     */
    async uploadMedia(mediaUrl) {
        const [ media_data ] = await fetch.remote(mediaUrl);
        const args = {
            media_data
        };
        const response = await this._twitterClient.post('media/upload', args);
        return response.media_id_string;
    }

    /**
     * Sends a tweet with the given content to the authenticated account.
     *
     * @param {string} content - Tweet content. Should not be over 140 chars.
     * @param {string} [media=''] - List of media ids to associate with the tweet.
     * @param {string} [inReplyTo] - Tweet this is a reply to.
     * @returns {string} URL of the tweet.
     */
    async tweet(content, media = '', inReplyTo = null) {
        if(self(this).tweetTooLong(content)) {
            return Promise.reject(new Error("Tweet content too long"));
        }

        const args = {
            status: content
        };

        if(inReplyTo) {
            const tweetId = self(this).getTweetIDFromURL(inReplyTo);
            if(tweetId) {
                args.in_reply_to_status_id = tweetId;
                const recipient = self(this).getUserFromURL(inReplyTo);
                const mentions = twitter.extractMentions(content).map((m) => m.toLowerCase());
                if(!mentions.length || !mentions.includes(recipient.toLowerCase())) {
                    args.auto_populate_reply_metadata = "true";
                }
            }
        }
        if(media.length) {
            args.media_ids = media;
        }
        await this.ready;

        const [
            res,
            username
        ] = await Promise.all([
            this._twitterClient.post('statuses/update', args),
            this.getUsername()
        ]);
        return self(this).makeTweetPermalink(username, res.id_str);
    }

    /**
     * Retweet a tweet based on its URL.
     *
     * @async
     * @param {string} url - URL to the tweet to retweet.
     * @returns {string} URL to the retweet.
     */
    async retweet(url) {
        const tweetId = self(this).getTweetIDFromURL(url);
        await this.ready;

        return this._twitterClient.post(`statuses/retweet/${tweetId}`, {})
            .then(() => url);
    }

    /**
     * Verifies the login credentials and stores the screenname if successful.
     *
     * @async
     * @returns {undefined}
     */
    checkLogin() {
        return this._twitterClient.get('account/verify_credentials', {}).then((res) => {
            this.username = res.screen_name;
            this.id = res.id_str;
        });
    }

    /**
     * Returns the username when available.
     *
     * @returns {string} Authenticated username.
     */
    async getUsername() {
        await this.ready;
        return this.username;
    }

    /**
     * Returns the Twitter ID of the current account when available.
     *
     * @returns {string} Authenticated user ID.
     */
    async getID() {
        await this.ready;
        return this.id;
    }

    async separateContentAndMedia(card) {
        const staticRef = self(this);
        const contentSection = staticRef.GetContentSection(card);
        const [ content, media ] = staticRef.getMediaAndContent(contentSection);
        const mediaIds = await Promise.all(media.map((m) => this.uploadMedia(m)));
        return [ content, mediaIds.join(",") ];
    }

    async checkPosts(column, markPublished) {
        const tweets = await this.tweets;
        const cards = await column.cards;

        for(const card of Object.values(cards)) {
            if(!card.content.hasSection(TwitterFormatter.RETWEET)) {
                const [ content ] = self(this).getMediaAndContent(self(this).GetContentSection(card));
                const tweet = tweets.find((t) => 'full_text' in t ? t.full_text.includes(content) : t.text.includes(content));
                if(tweet) {
                    await markPublished(card, self(this).makeTweetPermalink(tweet.user.screen_name, tweet.id_str));
                }
            }
            else {
                const retweetID = self(this).getTweetIDFromURL(card.content.getSection(TwitterFormatter.RETWEET));
                const didRetweet = tweets.some((t) => t.retweeted_status && t.retweeted_status.id_str === retweetID);
                if(didRetweet) {
                    await markPublished(card, 'Already retweeted.');
                }
            }
        }
    }

    isCardHighPrio(card) {
        return card.content.hasSection(TwitterFormatter.REPLY_TO);
    }

    async publish(card) {
        let url;
        if(card.content.hasSection(TwitterFormatter.RETWEET)) {
            url = await this.retweet(card.content.getSection(TwitterFormatter.RETWEET));
        }
        else {
            let replyTo = null;
            if(card.content.hasSection(TwitterFormatter.REPLY_TO)) {
                replyTo = card.content.getSection(TwitterFormatter.REPLY_TO);
            }
            const [ content, media ] = await this.separateContentAndMedia(card);
            url = await this.tweet(content, media, replyTo);
        }
        let successMsg = "Successfully tweeted. See " + url;
        if(card.content.hasSection(TwitterFormatter.RETWEET)) {
            successMsg = "Successfully retweeted.";
        }
        return successMsg;
    }
}

module.exports = TwitterAccount;
