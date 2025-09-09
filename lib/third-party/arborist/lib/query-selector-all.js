import localeCompare from "@isaacs/string-locale-compare";
import { parser } from "@npmcli/query";

localeCompare("en");

// handle results for parsed query asts, results are stored in a map that has a
// key that points to each ast selector node and stores the resulting array of
// arborist nodes as its value, that is essential to how we handle multiple
// query selectors, e.g: `#a, #b, #c` <- 3 diff ast selector nodes
class Results {
  #currentAstSelector;
  #initialItems;
  #inventory;
  #results = new Map();
  #targetNode;

  constructor(opts) {
    this.#currentAstSelector = opts.rootAstNode.nodes[0];
    this.#inventory = opts.inventory;
    this.#initialItems = opts.initialItems;
    this.#targetNode = opts.targetNode;

    this.currentResults = this.#initialItems;

    // We get this when first called and need to pass it to pacote
    this.flatOptions = opts.flatOptions || {};

    // reset by rootAstNode walker
    this.currentAstNode = opts.rootAstNode;
  }

  get currentResults() {
    return this.#results.get(this.#currentAstSelector);
  }

  set currentResults(value) {
    this.#results.set(this.#currentAstSelector, value);
  }

  // retrieves the initial items to which start the filtering / matching
  // for most of the different types of recognized ast nodes, e.g: class (aka
  // depType), id, *, etc in different contexts we need to start with the
  // current list of filtered results, for example a query for `.workspace`
  // actually means the same as `*.workspace` so we want to start with the full
  // inventory if that's the first ast node we're reading but if it appears in
  // the middle of a query it should respect the previous filtered results,
  // combinators are a special case in which we always want to have the
  // complete inventory list in order to use the left-hand side ast node as a
  // filter combined with the element on its right-hand side
  get initialItems() {
    const firstParsed =
      this.currentAstNode.parent.nodes[0] === this.currentAstNode &&
      this.currentAstNode.parent.parent.type === "root";

    if (firstParsed) {
      return this.#initialItems;
    }

    if (this.currentAstNode.prev().type === "combinator") {
      return this.#inventory;
    }
    return this.currentResults;
  }

  // combinators need information about previously filtered items along
  // with info of the items parsed / retrieved from the selector right
  // past the combinator, for this reason combinators are stored and
  // only ran as the last part of each selector logic
  // when collecting results to a root astNode, we traverse the list of child
  // selector nodes and collect all of their resulting arborist nodes into a
  // single/flat Set of items, this ensures we also deduplicate items
  collect(rootAstNode) {
    return new Set(rootAstNode.nodes.flatMap((n) => this.#results.get(n)));
  }
}

// checks if a given node has a direct parent in any of the nodes provided in
// the compare nodes array
const hasParent = (node, compareNodes) => {
  // All it takes is one so we loop and return on the first hit
  for (let compareNode of compareNodes) {
    if (compareNode.isLink) {
      compareNode = compareNode.target;
    }

    // follows logical parent for link anscestors
    if (node.isTop && node.resolveParent === compareNode) {
      return true;
    }
    // follows edges-in to check if they match a possible parent
    for (const edge of node.edgesIn) {
      if (edge && edge.from === compareNode) {
        return true;
      }
    }
  }
  return false;
};

// checks if a given node is a descendant of any of the nodes provided in the
// compareNodes array
const _hasAscendant = (node, compareNodes, seen = new Set()) => {
  // TODO (future) loop over ancestry property
  if (hasParent(node, compareNodes)) {
    return true;
  }

  if (node.isTop && node.resolveParent) {
    /* istanbul ignore if - investigate if linksIn check obviates need for this */
    if (_hasAscendant(node.resolveParent, compareNodes)) {
      return true;
    }
  }
  for (const edge of node.edgesIn) {
    // TODO Need a test with an infinite loop
    if (seen.has(edge)) {
      continue;
    }
    seen.add(edge);
    if (edge?.from && _hasAscendant(edge.from, compareNodes, seen)) {
      return true;
    }
  }
  for (const linkNode of node.linksIn) {
    if (_hasAscendant(linkNode, compareNodes, seen)) {
      return true;
    }
  }
  return false;
};
const retrieveNodesFromParsedAst = async (opts) => {
  // when we first call this it's the parsed query.  all other times it's
  // results.currentNode.nestedNode
  const rootAstNode = opts.rootAstNode;

  if (!rootAstNode.nodes) {
    return new Set();
  }

  const results = new Results(opts);

  const astNodeQueue = new Set();
  // walk is sync, so we have to build up our async functions and then await them later
  rootAstNode.walk((nextAstNode) => {
    astNodeQueue.add(nextAstNode);
  });

  for (const nextAstNode of astNodeQueue) {
    // This is the only place we reset currentAstNode
    results.currentAstNode = nextAstNode;
    const updateFn = `${results.currentAstNode.type}Type`;
    if (typeof results[updateFn] !== "function") {
      throw Object.assign(
        new Error(
          `\`${results.currentAstNode.type}\` is not a supported selector.`,
        ),
        { code: "EQUERYNOSELECTOR" },
      );
    }
    await results[updateFn]();
  }

  return results.collect(rootAstNode);
};

const querySelectorAll = async (targetNode, query, flatOptions) => {
  // This never changes ever we just pass it around. But we can't scope it to
  // this whole file if we ever want to support concurrent calls to this
  // function.
  const inventory = [...targetNode.root.inventory.values()];
  // res is a Set of items returned for each parsed css ast selector
  const res = await retrieveNodesFromParsedAst({
    initialItems: inventory,
    inventory,
    flatOptions,
    rootAstNode: parser(query),
    targetNode,
  });

  // returns nodes ordered by realpath
  return [...res].sort((a, b) => localeCompare(a.location, b.location));
};

export default querySelectorAll;
