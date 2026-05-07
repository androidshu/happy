import { describe, expect, it, vi } from 'vitest';

vi.mock('./EditView', () => ({ EditView: Symbol('EditView') }));
vi.mock('./BashView', () => ({ BashView: Symbol('BashView') }));
vi.mock('./WriteView', () => ({ WriteView: Symbol('WriteView') }));
vi.mock('./TodoView', () => ({ TodoView: Symbol('TodoView') }));
vi.mock('./ExitPlanToolView', () => ({ ExitPlanToolView: Symbol('ExitPlanToolView') }));
vi.mock('./MultiEditView', () => ({ MultiEditView: Symbol('MultiEditView') }));
vi.mock('./TaskView', () => ({ TaskView: Symbol('TaskView') }));
vi.mock('./BashViewFull', () => ({ BashViewFull: Symbol('BashViewFull') }));
vi.mock('./EditViewFull', () => ({ EditViewFull: Symbol('EditViewFull') }));
vi.mock('./MultiEditViewFull', () => ({ MultiEditViewFull: Symbol('MultiEditViewFull') }));
vi.mock('./CodexBashView', () => ({ CodexBashView: Symbol('CodexBashView') }));
vi.mock('./CodexPatchView', () => ({ CodexPatchView: Symbol('CodexPatchView') }));
vi.mock('./CodexDiffView', () => ({ CodexDiffView: Symbol('CodexDiffView') }));
vi.mock('./AskUserQuestionView', () => ({ AskUserQuestionView: Symbol('AskUserQuestionView') }));
vi.mock('./GeminiEditView', () => ({ GeminiEditView: Symbol('GeminiEditView') }));
vi.mock('./GeminiExecuteView', () => ({ GeminiExecuteView: Symbol('GeminiExecuteView') }));
vi.mock('./FileView', () => ({ FileView: Symbol('FileView') }));

import { getToolFullViewComponent } from './_all';

describe('tool full view registry', () => {
    it('resolves full views for file-modification tools', () => {
        expect(getToolFullViewComponent('Edit')).toBeTruthy();
        expect(getToolFullViewComponent('MultiEdit')).toBeTruthy();
        expect(getToolFullViewComponent('Write')).toBeTruthy();
        expect(getToolFullViewComponent('CodexPatch')).toBeTruthy();
        expect(getToolFullViewComponent('CodexDiff')).toBeTruthy();
    });
});
