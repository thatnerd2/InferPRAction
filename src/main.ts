import * as core from '@actions/core'
import fs from 'fs'
import {scanSourceFiles, mockUpdateSarifWithFixes} from './client'
import {writePRReview} from './pr_comment'

async function run(): Promise<void> {
  try {
    const github_token = core.getInput('github_token')
    const sarif_path: string = core.getInput('sarif_path')
    const sarif = JSON.parse(fs.readFileSync(sarif_path, 'utf8'))
    console.log('SARIF read successfully')
    const sourceFilesMap = scanSourceFiles(sarif)
    const result = await mockUpdateSarifWithFixes(sarif, sourceFilesMap)

    // do PR comments
    writePRReview(result, github_token)
    fs.writeFileSync('updated_sarif.json', JSON.stringify(result.sarif))
    core.setOutput('updated_sarif', 'updated_sarif.json')
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
