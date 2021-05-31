const fs = require('fs')
const path = require('path')
const nock = require('nock')
const { Probot, ProbotOctokit } = require('probot')

const createScheduler = require('./')
const githubAPI = nock('https://api.github.com').persist()

const payload = require('./fixtures/installation-created.json')
const privateKey = fs.readFileSync(
  path.join(__dirname, 'fixtures/mock-cert.pem'),
  'utf-8'
)

describe('Schedules intervals for a repository', () => {
  let probot
  let mockHandler = jest.fn()

  beforeEach(() => {
    nock.disableNetConnect()

    probot = new Probot({
      appId: 2,
      privateKey: privateKey,
      // Disable throttling & retrying requests for easier testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false }
      })
    })
    probot.load((app) => {
      createScheduler(app, {
        delay: false,
        interval: 500
      })

      app.on('schedule.repository', mockHandler)
    })
  })

  it('gets a page of repositories', async (done) => {
    // Mock authed by access token.
    githubAPI.post('/app/installations/2/access_tokens')
      .reply(200, {
        token: 'test',
        permissions: {
          issues: 'write'
        }
      })

    // Mock list all installation.
    githubAPI.get(/\/app\/installations/)
      .reply(200, [
        {
          'id': 2,
          'account': {
            'login': 'octocat',
            'id': 2
          },
          'app_id': 2
        }
      ])

    // Mock list all repositories.
    const pages = {
      1: {
        body: [{ id: 1 }],
        headers: {
          Link: '<https://api.github.com/installation/repositories?page=2&per_page=100>; rel="next"',
          'X-GitHub-Media-Type': 'github.v3; format=json'
        }
      },
      2: {
        body: [{ id: 2 }]
      }
    }
    githubAPI.get('/installation/repositories')
      .query({ per_page: 100 })
      .reply(200, pages[1].body, pages[1].headers)
      .get('/installation/repositories')
      .query({ page: 2, per_page: 100 })
      .reply(200, pages[2].body)

    await probot.receive({ name: 'installation', payload })

    setTimeout(() => {
      expect(mockHandler).toBeCalled()
      expect(mockHandler.mock.calls.length).toBe(4)
      done()
    }, 750)
  })
})
