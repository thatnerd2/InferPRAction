import {SarifFileContents} from './client'
import {Octokit} from '@octokit/rest'
import fs from 'fs'

type ReviewComment = {
  path: string
  body: string
  line: number
  side: 'LEFT' | 'RIGHT'
  start_line?: number
}

type ValidRegion = {
  path: string
  start_line: number
  end_line: number
}

function parsePatchesToValidRegions(patches: string): ValidRegion[] {
  console.log(patches)
  const paths = patches
    .split('\n')
    .filter(line => line.startsWith('diff --git a/'))
    .map(line => line.split(' ')[3].slice(2))
  const lines = patches
    .split('\n')
    .filter(line => line.startsWith('@@'))
    .map(line => line.split('@@')[1].split(' ')[2].split(','))
    .map(line => [Math.abs(parseInt(line[0])), Math.abs(parseInt(line[1]))])
  const validRegions = paths.map((path, i) => ({
    path,
    start_line: lines[i][0],
    end_line: lines[i][0] + lines[i][1] - 1
  }))
  console.log(validRegions)
  return validRegions
}

export async function writePRReview(
  sarif: SarifFileContents
): Promise<boolean> {
  if (
    !process.env.GITHUB_REPOSITORY ||
    !process.env.GITHUB_EVENT_PATH ||
    !process.env.GITHUB_TOKEN
  ) {
    console.log(
      'Failed to get GITHUB_REPOSITORY, GITHUB_EVENT_PATH or GITHUB_TOKEN'
    )
    console.log(process.env.GITHUB_REPOSITORY)
    console.log(process.env.GITHUB_EVENT_PATH)
    console.log(process.env.GITHUB_TOKEN)
    return false
  }

  const octokit = new Octokit({auth: process.env.GITHUB_TOKEN})
  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')
  )
  const owner = process.env.GITHUB_REPOSITORY.split('/')[0]
  const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
  const commit_id = event.after
  const pull_number = event.pull_request.number

  // get the pull request data
  const patchUrl = (
    await octokit.pulls.get({
      owner,
      repo,
      pull_number
    })
  ).data.patch_url
  const patches = (
    await octokit.request(patchUrl, {
      headers: {
        Accept: 'application/vnd.github.v3.patch'
      }
    })
  ).data
  const validRegions = parsePatchesToValidRegions(patches)

  const reviewComments = []
  for (const run of sarif['runs']) {
    for (const result of run['results']) {
      const uri =
        result['locations'][0]['physicalLocation']['artifactLocation']['uri']
      if (!('fixes' in result)) {
        continue
      }

      const suggested_change =
        result['fixes'][0]['artifactChanges'][0]['replacements'][0][
          'insertedContent'
        ]
      const change_start_line =
        result['fixes'][0]['artifactChanges'][0]['replacements'][0][
          'deletedRegion'
        ]['startLine']
      const change_end_line =
        result['fixes'][0]['artifactChanges'][0]['replacements'][0][
          'deletedRegion'
        ]['endLine']
      const description = result['fixes'][0]['description']['text']
      const commentText = `(Copilot Defender Preview)\n\n${description}\n\n\`\`\`suggestion\n${suggested_change}\n\`\`\``

      if (
        !validRegions.some(
          region =>
            region.path === uri &&
            region.start_line <= change_start_line &&
            region.end_line >= change_end_line
        )
      ) {
        console.log(`Skipping comment because it's outside of the valid region`)
        continue
      }

      const reviewComment: ReviewComment = {
        path: uri,
        body: commentText,
        line: change_end_line,
        side: 'RIGHT'
      }

      if (change_end_line > change_start_line) {
        reviewComment['start_line'] = change_start_line
      }

      reviewComments.push(reviewComment)
    }
  }

  if (reviewComments.length > 0) {
    const review = (
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number,
        commit_id,
        event: 'COMMENT',
        body: 'Copilot Defender Preview\n\nPlease review the suggested changes.',
        comments: reviewComments
      })
    ).data
    console.log('Submitted review:')
    console.log(review)
  } else {
    console.log("Skipping review because there's no comments")
  }
  return true
}
