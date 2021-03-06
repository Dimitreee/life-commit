const chalk = require('chalk');
const execa = require('execa');
const fs = require('fs');
const inquirer = require('inquirer');
const path = require('path');
const pathExists = require('path-exists');
const uuid = require('uuid/v4');
const prompts = require('./prompts');

inquirer.registerPrompt('datetime', require('inquirer-datepicker-prompt'));
class lifeCli {
  constructor(lifeApiClient) {
    this._lifeApiClient = lifeApiClient;
  }

  init() {
    if (this._getCommitsPath().exist === false) {
      this._createFile(this._getCommitsPath().path, []);
      console.log(
        `${chalk.cyan('Your life has been initialized successfully!')}`
      );
      return;
    } else {
      return this._errorMessage(
        'Your life had been initialized. Start commit now!'
      );
    }
  }

  commit() {
    let patch = {};
    if (this._getCommitsPath().exist === false) {
      return this._errorMessage('Please initialize your life first.');
    }
    return this._commitPrompt()
      .then(answers => {
        patch = {
          lifemoji: `${answers.lifemoji}`,
          title: `${answers.title}`,
          message: `${answers.message}`,
          date: answers.date,
          id: uuid(),
        };
        return this._fetchCommits();
      })
      .then(commits => {
        commits.push(patch);
        this._createFile(this._getCommitsPath().path, commits);
      })
      .then(() => {
        console.log(`${chalk.green('1 commit added')}`);
      })
      .catch(error => {
        return this._errorMessage(error);
      });
  }
  log() {
    if (this._getCommitsPath().exist === false) {
      return this._errorMessage('Please initialize your life first.');
    }
    return this._fetchCommits()
      .then(commits => {
        commits.sort((c1, c2) => {
          if (new Date(c1.date).getTime() < new Date(c2.date).getTime())
            return 1;
          else return -1;
        });
        commits.forEach(commit => {
          const date = new Date(commit.date).toString('yyyy/M/d');
          console.log(
            `* ${chalk.red(commit.id.slice(0, 6))} - ${
              commit.lifemoji
            }  ${chalk.blue(commit.title)} ${chalk.green(date)}`
          );
        });
      })
      .catch(error => {
        return this._errorMessage(error);
      });
  }
  edit() {
    if (this._getCommitsPath().exist === false) {
      return this._errorMessage('Please initialize your life first.');
    }
    if (process.argv.length < 4)
      return this._errorMessage('Please specify the commit id.');
    let id = process.argv[3];
    let commits = [],
      index;
    return this._fetchCommits()
      .then(data => {
        commits = data;
        index = commits.findIndex(patch => patch.id.indexOf(id) !== -1);
        if (index === -1) {
          return this._errorMessage('Commit id does not exist.');
        } else {
          const date = new Date(commits[index].date).toString('yyyy/M/d');
          console.log(
            `* ${chalk.red(commits[index].id.slice(0, 6))} - ${
              commits[index].lifemoji
            }  ${chalk.blue(commits[index].title)} ${chalk.green(date)}`
          );
          return inquirer.prompt(prompts.edit.choose()).then(answers => {
            if (answers.choose === 'Remove') {
              commits.splice(index, 1);
              console.log(`${chalk.red('1 commit removed')}`);
              return;
            } else {
              return this._commitPrompt().then(answers => {
                let patch = {
                  lifemoji: `${answers.lifemoji}`,
                  title: `${answers.title}`,
                  message: `${answers.message}`,
                  date: answers.date,
                };
                Object.assign(commits[index], patch);
                console.log(`${chalk.blue('1 commit edited')}`);
              });
            }
          });
        }
      })
      .then(() => {
        this._createFile(this._getCommitsPath().path, commits);
      })
      .catch(error => {
        return this._errorMessage(error);
      });
  }
  dir() {
    if (this._getCommitsPath().exist === false) {
      return this._errorMessage('Please initialize your life first.');
    }
    const folder = process.argv[3] || 'website';
    const cmd = `cp -r ${__dirname}/website ${folder}`;
    execa
      .shell(cmd)
      .catch(err => this._errorMessage(err.stderr ? err.stderr : err.stdout));
    console.log(
      `${chalk.green('Successfully create folder at:')} ${chalk.green(
        process.cwd() + '/' + folder
      )}\n`
    );
    console.log(
      `${chalk.cyan(`Run the following commands to visualize your commits!`)}`
    );
    console.log(`$ npm install`);
    console.log(`$ npm run start`);
  }
  _commitPrompt() {
    return this._fetchLifemojis()
      .then(lifemojis => inquirer.prompt(prompts.commit(lifemojis)))
      .catch(err => this._errorMessage(err.code));
  }

  _errorMessage(message) {
    console.error(chalk.red(`ERROR: ${message}`));
  }

  _parseLifemojis(lifemojis) {
    return lifemojis.map(lifemoji => {
      return console.log(
        `${lifemoji.emoji} - ${chalk.blue(lifemoji.code)} - ${
          lifemoji.description
        }`
      );
    });
  }

  _fetchCommits() {
    return Promise.resolve(
      JSON.parse(fs.readFileSync(this._getCommitsPath().path))
    );
  }

  _getCommitsPath() {
    const home = process.env.HOME || process.env.USERPROFILE;
    const commitPath = path.join(home, '.life-commit', 'commits.json');
    return { path: commitPath, exist: pathExists.sync(commitPath) };
  }

  _getCachePath() {
    const home = process.env.HOME || process.env.USERPROFILE;
    const cachePath = path.join(home, '.life-commit', 'lifemojis.json');
    return { path: cachePath, exist: pathExists.sync(cachePath) };
  }

  _createFile(filePath, data) {
    const fileDir = path.dirname(filePath);

    if (data !== undefined) {
      if (!pathExists.sync(fileDir)) {
        fs.mkdirSync(fileDir);
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, ' '));
    }
  }

  _fetchRemoteLifemojis() {
    return this._lifeApiClient
      .request({
        method: 'GET',
        url: '/src/data/lifemojis.json',
      })
      .then(res => {
        console.log(`${chalk.yellow('Lifemojis')} updated successfully!`);
        return res.data;
      })
      .catch(error =>
        this._errorMessage(`Network connection not found - ${error.code}`)
      );
  }

  _fetchCachedLifemojis(cachePath) {
    return Promise.resolve(JSON.parse(fs.readFileSync(cachePath)));
  }

  _fetchLifemojis() {
    const res = this._getCachePath();
    if (res.exist === true) {
      return this._fetchCachedLifemojis(res.path);
    }
    return this._fetchRemoteLifemojis().then(Lifemojis => {
      this._createFile(res.path, Lifemojis);
      return Lifemojis;
    });
  }
}

module.exports = lifeCli;
