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
    console.log('Source files scanned successfully')
    const result = await mockUpdateSarifWithFixes(sarif, sourceFilesMap)
    console.log('Obtained updated SARIF')

    // do PR comments
    writePRReview(result, github_token)
    fs.writeFileSync('updated_sarif.json', JSON.stringify(result))
    core.setOutput('updated_sarif', 'updated_sarif.json')
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
