import * as core from '@actions/core'
import fs from 'fs'
import {scanSourceFiles, updateSarifWithFixes} from './client'
import {writePRReview} from './pr_comment'

async function run(): Promise<void> {
  try {
    const CPD_GITHUB_TOKEN = core.getInput('CPD_GITHUB_TOKEN')
    const DPBF_TOKEN = core.getInput('DPBF_TOKEN')
    const sarif_path: string = core.getInput('sarif_path')
    const sarif = JSON.parse(fs.readFileSync(sarif_path, 'utf8'))
    console.log('SARIF read successfully')
    const sourceFilesMap = scanSourceFiles(sarif)
    console.log('Source files scanned successfully')
    console.log(DPBF_TOKEN)
    const result = await updateSarifWithFixes(sarif, sourceFilesMap, DPBF_TOKEN)
    console.log('Obtained updated SARIF:')
    console.log(result)

    // do PR comments
    writePRReview(result, CPD_GITHUB_TOKEN)
    fs.writeFileSync('updated_sarif.json', JSON.stringify(result))
    core.setOutput('updated_sarif', 'updated_sarif.json')
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
