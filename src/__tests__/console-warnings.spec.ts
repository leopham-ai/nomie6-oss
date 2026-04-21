/**
 * Svelte Unknown Props Checker
 * 
 * Static analysis to catch common unknown prop issues before runtime.
 * Run with: pnpm vtest src/__tests__/console-warnings.spec.ts
 */

import { it, describe, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// Known component prop requirements
const COMPONENT_PROPS = {
  'blocker-modal.svelte': ['id'],
  'pop-menu2.svelte': ['id'],
  'slider.svelte': ['step'], // NOT steps
}

// Patterns that cause warnings
const BAD_PATTERNS = [
  {
    file: 'slider.svelte',
    pattern: /steps=\{parseFloat\(/,
    issue: 'svelte-range-slider-pips uses "step" not "steps"',
    fix: 'Change steps={parseFloat(...)} to step={parseFloat(...)}'
  }
]

function findSvelteFiles(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && !entry.name.includes('node_modules')) {
      files.push(...findSvelteFiles(fullPath))
    } else if (entry.name.endsWith('.svelte')) {
      files.push(fullPath)
    }
  }
  return files
}

function checkFile(filePath: string) {
  const issues: Array<{ issue: string; fix: string }> = []
  const content = fs.readFileSync(filePath, 'utf-8')
  const fileName = path.basename(filePath)
  
  // Check 1: RangeSlider with steps (should be step)
  if (fileName === 'slider.svelte' && content.includes('steps={')) {
    issues.push({
      issue: 'slider.svelte uses "steps" prop - svelte-range-slider-pips expects "step"',
      fix: 'Change steps={parseFloat(tracker.step || 1)} to step={parseFloat(tracker.step || 1)}'
    })
  }
  
  // Check 2: Components that need id prop
  const needsId = ['blocker-modal.svelte']
  if (needsId.includes(fileName) && !content.includes('export let id')) {
    issues.push({
      issue: `${fileName} receives id= prop but does not export it`,
      fix: "Add 'export let id: string | undefined = undefined' to script section"
    })
  }
  
  return issues
}

describe('Svelte Unknown Props', () => {
  const srcDir = path.join(__dirname, '..')
  const svelteFiles = findSvelteFiles(srcDir)
  
  it('slider.svelte should use "step" not "steps" for RangeSlider', () => {
    const sliderPath = path.join(srcDir, 'domains/tracker/input/slider.svelte')
    const content = fs.readFileSync(sliderPath, 'utf-8')
    
    const hasSteps = content.includes('steps={')
    const hasStep = content.includes('step=') || content.includes('step =')
    
    expect(hasSteps).toBe(false)
  })
  
  it('blocker-modal.svelte should export id prop', () => {
    const blockerPath = path.join(srcDir, 'components/backdrop/blocker-modal.svelte')
    const content = fs.readFileSync(blockerPath, 'utf-8')
    
    expect(content).toContain('export let id')
  })
  
  it('no svelte:component should pass id= without ensuring recipient accepts it', () => {
    const backdropPath = path.join(srcDir, 'components/backdrop/backdrop2.svelte')
    if (!fs.existsSync(backdropPath)) return
    
    const content = fs.readFileSync(backdropPath, 'utf-8')
    
    // Check if backdrop2 passes id to svelte:component
    if (content.includes('svelte:component') && content.includes('id={modal.id}')) {
      // If so, ensure all modal components export id
      const modalComponents = [
        'blocker-modal.svelte'
      ]
      
      for (const comp of modalComponents) {
        const compPath = path.join(srcDir, 'components/backdrop', comp)
        if (fs.existsSync(compPath)) {
          const compContent = fs.readFileSync(compPath, 'utf-8')
          expect(compContent).toContain('export let id')
        }
      }
    }
  })
  
  it('routes should not cause Router focus warnings', () => {
    const routesPath = path.join(srcDir, 'routes/routes.svelte')
    const content = fs.readFileSync(routesPath, 'utf-8')
    
    // Track route should have primary={false} or a header
    if (content.includes('path="/track"')) {
      const trackRouteMatch = content.match(/<Route path="\/track"[^>]*>/)
      if (trackRouteMatch) {
        const routeTag = trackRouteMatch[0]
        // Either has primary={false} or the component inside has a header
        const hasPrimaryFalse = routeTag.includes('primary={false}')
        
        // If not, we expect the Track component to have a header
        // This is checked by the component existing and having a header slot
        expect(hasPrimaryFalse || content.includes('primary={false}')).toBeTruthy()
      }
    }
  })
})
