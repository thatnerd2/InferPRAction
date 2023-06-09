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
  const validRegions = patches
    .split('diff --git a/')
    .map(block => {
      const patchLines = block.split('\n')
      const path = patchLines[0].split(' ')[1].slice(2)
      const diffLine = patchLines.find(line => line.startsWith('@@'))
      if (!diffLine) {
        return undefined
      }
      const lines = diffLine
        .split('@@')[1]
        .split(' ')[2]
        .split(',')
        .map(line => Math.abs(parseInt(line)))
      if (lines.length !== 2) {
        return undefined
      }
      return {
        path,
        start_line: lines[0],
        end_line: lines[0] + lines[1] - 1
      }
    })
    .filter(region => region !== undefined) as ValidRegion[]
  console.log('Patches:')
  console.log(patches)
  console.log('Valid Regions')
  console.log(validRegions)
  return validRegions
}

export async function writePRReview(
  sarif: SarifFileContents,
  github_token: string
): Promise<boolean> {
  if (!process.env.GITHUB_REPOSITORY || !process.env.GITHUB_EVENT_PATH) {
    console.log(
      'Failed to get GITHUB_REPOSITORY, GITHUB_EVENT_PATH or github_token'
    )
    console.log(process.env.GITHUB_REPOSITORY)
    console.log(process.env.GITHUB_EVENT_PATH)
    return false
  }

  const octokit = new Octokit({auth: github_token})
  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')
  )
  const owner = process.env.GITHUB_REPOSITORY.split('/')[0]
  const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
  const commit_id = event.after
  const pullNumber = event.pull_request.number

  // get the pull request data
  const patchUrl = (
    await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber
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
      // Sometimes the path is an absolute path in the form /home/.../repo/repo/file, so we need to split by repo name and take the
      const rawUri =
        result['locations'][0]['physicalLocation']['artifactLocation']['uri']
      const uri = rawUri.includes(`${repo}/${repo}/`)
        ? rawUri.split(`${repo}/`).slice(2).join(`${repo}/`)
        : rawUri

      if (!('fixes' in result)) {
        continue
      }

      const change_start_line =
        result['fixes'][0]['artifactChanges'][0]['replacements'][0][
          'deletedRegion'
        ]['startLine']
      const change_end_line =
        result['fixes'][0]['artifactChanges'][0]['replacements'][0][
          'deletedRegion'
        ]['endLine']
      const description = result['fixes'][0]['description']['text']
      const commentText = `(Copilot Defender Preview)\n\n${description}`

      if (
        !validRegions.some(
          region =>
            region.path === uri &&
            region.start_line <= change_start_line &&
            region.end_line >= change_end_line
        )
      ) {
        console.log(`Skipping comment because it's outside of the valid region`)
        console.log(`${uri}:${change_start_line}-${change_end_line}`)
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
        pull_number: pullNumber,
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
