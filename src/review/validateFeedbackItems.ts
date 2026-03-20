import {
  descriptionContainsSourceTerm,
  isSourceReference,
  resolveSourceFile,
  resolveSourceSection,
  type LoadedSourceContext,
} from './reviewSourceContext.js';
import type { DesignReviewFeedbackItem } from './types.js';

export interface ValidateFeedbackItemsInput {
  feedbackItems: DesignReviewFeedbackItem[];
  loadedSource: LoadedSourceContext;
}

export interface ValidateFeedbackItemsResult {
  error?: string;
}

export function validateFeedbackItems(input: ValidateFeedbackItemsInput): ValidateFeedbackItemsResult {
  for (let index = 0; index < input.feedbackItems.length; index += 1) {
    const item = input.feedbackItems[index]!;
    const itemNumber = index + 1;

    if (!item.codeReference?.trim()) {
      return { error: `Item ${itemNumber}: _Ref: path_ is required on manual feedback items` };
    }

    const ref = item.codeReference.trim();
    if (!isSourceReference(ref, input.loadedSource)) {
      return { error: `Item ${itemNumber}: _Ref: ${ref}_ not found in source context` };
    }

    const sourceSection = resolveSourceSection(ref, input.loadedSource);
    if (
      sourceSection === 'uses' &&
      item.section?.toLowerCase() !== 'usage'
    ) {
      return {
        error: `Item ${itemNumber}: _Ref: ${ref}_ is from Uses — only Usage-section feedback may reference use-site files`,
      };
    }

    const sourceFile = resolveSourceFile(ref, input.loadedSource);
    if (!sourceFile) {
      return { error: `Item ${itemNumber}: _Ref: ${ref}_ not found in source context` };
    }

    if (!descriptionContainsSourceTerm(item.description, sourceFile.content)) {
      return {
        error: `Item ${itemNumber}: description must include a term (length >= 4) from ${ref}`,
      };
    }
  }

  return {};
}
