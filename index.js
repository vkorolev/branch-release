#!/usr/bin/env node

'use strict';

const git = require('git-child');
const del = require('del');
const chalk = require('chalk');
const exec = require('promised-exec');
const argv = require('yargs').argv;

const RELEASES_BRANCH = process.env.BR_RELEASES_BRANCH || argv.b || 'releases';
const GH_TOKEN = process.env.GH_TOKEN || argv.t;
const DIST_DIR = process.env.BR_DIST_DIR || argv.d || 'dist';
const COMMIT_MESSAGE = process.env.BR_DIST_DIR || argv.m || 'Release v%ver%';
const BUILD_SCRIPT = process.env.BR_BUILD_SCRIPT || argv.s || 'build-dist';

function main() {
  branchRelease()
  .catch(err => fail(err));
}

function branchRelease() {
  return wasVersionChanged().then(versions => {
    if (versions[0] !== versions[1]) return buildAndPublish(versions[1]);
    log(chalk.green('Package version was not changed'));
  });
}

function wasVersionChanged() {
  let version;
  return git.checkout('master')
  .then(() => git.show('HEAD:package.json'))
  .then(contents => {
    version = JSON.parse(contents).version;
    return git.show('HEAD^:package.json')
  })
  .then(contents => {
    const prevVersion = JSON.parse(contents).version;
    return [prevVersion, version];
  })
}

function buildAndPublish(version) {
  let repoRef;

  log(`running: 'git checkout -B ${RELEASES_BRANCH}'`);
  return git.checkout({B: RELEASES_BRANCH})
  .then(() => {
    log(`running: 'git pull origin ${RELEASES_BRANCH}'`);
    return git.pull(['origin', RELEASES_BRANCH]);
  })
  .then(() => {
    log(`running: 'git merge master'`);
    return git.merge('master');
  })
  .then(() => {
    log('Clearing dist folder');
    return del([ DIST_DIR + '/**/*' ]);
  })
  .then(() => {
    let buildCommand = `npm run-script ${BUILD_SCRIPT}`;
    log(`running: '${buildCommand}'`);
    return exec(buildCommand);
  })
  .then(() => {
    log(`running: 'git add .'`);
    return git.add('.');
  })
  .then(() => {
    log(`running: 'git add ${DIST_DIR} -f'`);
    return git.add({
      _: DIST_DIR,
      f: true
    });
  })
  .then(() => {
    const commitMessage = COMMIT_MESSAGE.replace('%ver%', version);
    log(`running: 'git commit -m ${commitMessage}'`);
    return git.commit({m: commitMessage});
  })
  .then(() => {
    log(`running: 'git tag v${version}'`);
    return git.tag('v' + version);
  })
  .then(() => {
    return git.config({
      'get':true,
      '_': 'remote.origin.url'
    });
  })
  .then((remoteUrl) => {
    repoRef = remoteUrl.split('@').length > 1 ? remoteUrl.split('@')[1] : remoteUrl;
    repoRef = repoRef.trim();
    if (repoRef.startsWith('https://'))
      repoRef = repoRef.substring(8);


    let args = `${RELEASES_BRANCH}:${RELEASES_BRANCH}`;
    if (GH_TOKEN) {
      args = [`https://${GH_TOKEN}@${repoRef}`, args];
    }
    log(`running: 'git push'`);
    return git.push({
      '_': args
    });
  })
  .then(() => {
    let args = [];
    if (GH_TOKEN) {
      args = [`https://${GH_TOKEN}@${repoRef}`];
    }
    log(`running: 'git push --tags'`);
    return git.push({
      'tags': true,
      '_': args
    });
  })
  .finally(() => {
    log('switching back to master branch');
    return git.checkout('master');
  })
  .then(() => {
    log(chalk.green("Released successfully"))
  })
}

function log() {
  console.log.apply(console, arguments);
}

function fail(err) {
  let message = err.message || err.string;
  if (GH_TOKEN)
    message = message.replace(GH_TOKEN, 'xxGH_TOKENxx');
  log(chalk.red('Release failed:'))
  log(chalk.red(message));
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = branchRelease;
