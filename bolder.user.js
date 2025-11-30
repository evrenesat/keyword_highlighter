// ==UserScript==
// @name         Bolder
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Bolds uppercase and capitalized words using CSS Custom Highlight API, excluding sentence starts and block starts.
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    console.log('Bolder: Script started');

    try {
        // Check for CSS Custom Highlight API support
        if (typeof CSS === 'undefined' || !CSS.highlights) {
            console.warn('Bolder: CSS Custom Highlight API is not supported in this browser.');
            return;
        }

        if (typeof Highlight === 'undefined') {
            console.warn('Bolder: Highlight API is not supported (Highlight constructor missing).');
            return;
        }

        console.log('Bolder: CSS Custom Highlight API is supported.');

        // --- Configuration ---
        const CONFIG = {
            minUppercaseLen: 2,
            minCapitalizedLen: 3,
            terminators: new Set(['.', '!', '?', '…', ':', ';']),
            blockTags: new Set([
                'DIV', 'P', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                'HEADER', 'FOOTER', 'SECTION', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'FIGCAPTION'
            ]),
            excludedTags: new Set([
                'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
                'CODE', 'PRE', 'IFRAME', 'SVG', 'CANVAS', 'KBD', 'VAR'
            ]),
            excludedAttrs: ['contenteditable']
        };

        // --- Regex ---
        const RE_UPPERCASE = new RegExp(`^\\b[A-Z]{${CONFIG.minUppercaseLen},}\\b$`);
        const RE_CAPITALIZED = new RegExp(`^\\b[A-Z][a-z]{${CONFIG.minCapitalizedLen - 1},}\\b$`);
        const RE_MIXED_CASE = /^\b([A-Z][a-z]*[A-Z][a-zA-Z]*|[a-z]+[A-Z][a-zA-Z]*)\b$/;
        const RE_HYPHENATED = /^\b(?=.*[A-Z])[A-Za-z]+-[A-Za-z]+\b$/;

        // --- Highlight Registry ---
        const highlight = new Highlight();
        CSS.highlights.set('bolder-highlight', highlight);
        const activeRanges = new Set(); // Local tracking to avoid Xray iteration issues

        // --- CSS Injection ---
        const style = document.createElement('style');
        style.textContent = `
        ::highlight(bolder-highlight) {
            font-weight: 700 !important;
            background-color: #f9f4df;
        }
    `;
        document.head.appendChild(style);

        // --- State Management ---
        let atSentenceStart = true;

        // --- Helper Functions ---

        function isBlockElement(node) {
            return node.nodeType === Node.ELEMENT_NODE && CONFIG.blockTags.has(node.tagName);
        }

        function getBlockParent(node) {
            let current = node.parentElement;
            while (current) {
                if (isBlockElement(current)) return current;
                if (current === document.body) return current;
                current = current.parentElement;
            }
            return document.body;
        }

        function shouldSkipNode(node) {
            let current = node.parentElement;
            while (current) {
                if (CONFIG.excludedTags.has(current.tagName)) return true;
                if (current.isContentEditable) return true;
                if (current.getAttribute('aria-hidden') === 'true') return true;

                // Note: With Highlight API, we don't strictly need to exclude interactive roles 
                // to prevent breakage, but it might still be good for visual noise reduction.
                // However, the user specifically wanted bolding in DIVs, so we should be permissive.
                // We will keep the visibility check.
                if (current.style.display === 'none' || current.style.visibility === 'hidden' || current.style.opacity === '0') return true;

                current = current.parentElement;
            }
            return false;
        }

        function hasVisibleText(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                return /[a-zA-Z]/.test(node.nodeValue);
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (shouldSkipNode(node)) return false;
                return node.innerText && /[a-zA-Z]/.test(node.innerText);
            }
            return false;
        }

        function isFirstWordInBlock(textNode, blockParent) {
            let current = textNode;
            while (current) {
                if (current === blockParent) return true;

                let sibling = current.previousSibling;
                while (sibling) {
                    if (sibling.nodeName === 'BR') return true;
                    if (hasVisibleText(sibling)) return false;
                    sibling = sibling.previousSibling;
                }

                current = current.parentElement;
                if (current === blockParent) return true;
            }
            return true;
        }

        function processTextNode(textNode) {
            if (shouldSkipNode(textNode)) return;

            const text = textNode.nodeValue;
            if (!text.trim()) return;

            const blockParent = getBlockParent(textNode);

            // Cleanup existing ranges for this node to avoid duplicates
            // Iterate local Set instead of highlight object
            for (const range of activeRanges) {
                if (range.commonAncestorContainer === textNode) {
                    highlight.delete(range);
                    activeRanges.delete(range);
                }
            }

            // Tokenize while preserving separators to track offsets
            const tokens = text.split(/([.!?…:;]|\s+|[^a-zA-Z\-.!?…:;\s]+)/).filter(t => t);

            let isBlockStartNode = isFirstWordInBlock(textNode, blockParent);
            let currentOffset = 0;

            tokens.forEach(token => {
                // Check if token is a terminator
                if (CONFIG.terminators.has(token)) {
                    atSentenceStart = true;
                    isBlockStartNode = false;
                    currentOffset += token.length;
                    return;
                }

                // Check if token is whitespace or other non-word
                if (!/^[a-zA-Z\-]+$/.test(token)) {
                    currentOffset += token.length;
                    return;
                }

                // It's a word
                const isBlockStart = isBlockStartNode;
                if (isBlockStart) {
                    isBlockStartNode = false;
                }

                const isSentenceStart = atSentenceStart;
                if (isSentenceStart) {
                    atSentenceStart = false;
                }

                // Decision Logic
                let shouldBold = false;
                if (!isBlockStart && !isSentenceStart) {
                    if (RE_UPPERCASE.test(token) || RE_CAPITALIZED.test(token) || RE_MIXED_CASE.test(token) || RE_HYPHENATED.test(token)) {
                        shouldBold = true;
                    }
                }

                if (shouldBold) {
                    const range = new Range();
                    range.setStart(textNode, currentOffset);
                    range.setEnd(textNode, currentOffset + token.length);
                    highlight.add(range);
                    activeRanges.add(range);
                }

                currentOffset += token.length;
            });
        }

        // --- Traversal ---
        function traverse(root) {
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            const nodes = [];
            let node;
            while ((node = walker.nextNode())) {
                nodes.push(node);
            }

            nodes.forEach(processTextNode);
        }

        // --- Initialization ---
        traverse(document.body);

        // --- Cleanup ---
        function cleanupHighlights() {
            // Iterate over local Set instead of highlight registry
            for (const range of activeRanges) {
                // Check if the range's container is no longer in the document
                // OR if the container is not a text node (meaning the original text node was removed and range bubbled up)
                if (!range.commonAncestorContainer.isConnected || range.commonAncestorContainer.nodeType !== Node.TEXT_NODE) {
                    highlight.delete(range);
                    activeRanges.delete(range);
                }
            }
        }

        // --- MutationObserver ---
        const observer = new MutationObserver((mutations) => {
            let shouldCleanup = false;
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    if (mutation.removedNodes.length > 0) {
                        shouldCleanup = true;
                    }
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            traverse(node);
                        } else if (node.nodeType === Node.TEXT_NODE) {
                            processTextNode(node);
                        }
                    });
                } else if (mutation.type === 'characterData') {
                    // Text content changed, re-process the node
                    // First, remove existing ranges for this node to avoid duplicates/invalid ranges
                    // (Optimization: In a perfect world we'd find the specific range, but cleanup handles detached ones. 
                    // For attached ones that changed, we might just be adding more. 
                    // Let's rely on the fact that we are adding new ranges. 
                    // Ideally we should clear ranges for this node, but the API doesn't index by node.)
                    processTextNode(mutation.target);
                }
            });

            if (shouldCleanup) {
                cleanupHighlights();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // Periodic cleanup as a safety net (e.g., every 5 seconds)
        setInterval(cleanupHighlights, 5000);

    } catch (e) {
        console.error('Bolder: Fatal error initializing script:', e);
    }
})();
