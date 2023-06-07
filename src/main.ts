import * as core from '@actions/core'
import fs from 'fs'
import {updateSarifWithFixes, scanSourceFiles} from './client'
import {writePRComments} from './pr_comment'

async function run(): Promise<void> {
  try {
    const sarif_path: string = core.getInput('sarif')
    const sarif = JSON.parse(fs.readFileSync(sarif_path, 'utf8'))
    const sourceFilesMap = scanSourceFiles(sarif)
    const result = await updateSarifWithFixes(sarif, sourceFilesMap)

    // do PR comments
    writePRComments(result)
    fs.writeFileSync('updated_sarif.json', JSON.stringify(result.sarif))
    core.setOutput('updated_sarif', 'updated_sarif.json')
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
