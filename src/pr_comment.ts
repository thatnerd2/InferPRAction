import {SarifFileContents} from './client'
import {Octokit} from '@octokit/rest'

export async function writePRComments(sarif: SarifFileContents): Promise<void> {
  const octokit = new Octokit({auth: process.env.GITHUB_TOKEN})
  if (
    !process.env.GITHUB_REPOSITORY ||
    !process.env.GITHUB_SHA ||
    !process.env.PULL_NUMBER
  ) {
    console.log('Failed to get GITHUB_REPOSITORY, COMMIT_ID, or PULL_NUMBER')
    console.log(process.env.GITHUB_REPOSITORY)
    console.log(process.env.GITHUB_SHA)
    console.log(process.env.PULL_NUMBER)
    return
  }

  const owner = process.env.GITHUB_REPOSITORY.split('/')[0]
  const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
  const commit_id = process.env.GITHUB_SHA
  const pull_number = parseInt(process.env.PULL_NUMBER)

  const proposedComments: string[] = (
    await octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number
    })
  ).data.map(comment => comment.body)

  for (const run of sarif['runs']) {
    for (const result of run['results']) {
      const uri =
        result['locations'][0]['physicalLocation']['artifactLocation']['uri']
      if (!('fixes' in result)) {
        continue
      }
      // TODO make sure that uri is part of this PR

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

      if (proposedComments.includes(commentText)) {
        // We've already written this comment
        continue
      }

      octokit.pulls.createReviewComment({
        owner,
        repo,
        pull_number,
        commit_id,
        path: uri,
        body: commentText,
        start_line: change_start_line,
        line: change_end_line,
        side: 'RIGHT'
      })
    }
  }

  console.log('writePRComments')
  console.log(sarif)
}
