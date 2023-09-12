import { SearchSettings } from "@/lib/models";
import { chain, sumBy } from "lodash";
import { getCategoryId, pluralize } from "@/lib/utils";

const MAX_URIS_IN_CLAUSE = 200;

export function capitalizeFirstLetter(str) {
  return str
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function quoteIfNecessary(s) {
  if (s.match(/[(), "]/) || s.length === 0) {
    return "\"" + s.replaceAll("\"", "\\") + "\"";
  } else {
    return s;
  }
}

/**
 * Generate a filter from a search settings model.
 * @param {SearchSettings} searchSettings
 * @return {Array<Array<String>>}
 */
export function generateFilter(searchSettings) {
  let filter = [];
  if (searchSettings.taxon.length === 1) {
    filter.push(["taxon.id = " + searchSettings.taxon[0].id]);
  } else if (searchSettings.taxon.length > 0) {
    filter.push(["taxon.id in (" + searchSettings.taxon.map(t => t.id).join(",") + ")"]);
  }
  if (searchSettings.platforms.length > 0 || searchSettings.technologyTypes.length > 0) {
    let platformIds = searchSettings.platforms.map(p => p.id);
    let clause = [];
    if (searchSettings.platforms.length > 0) {
      clause.push("bioAssays.arrayDesignUsed.id in (" + platformIds.join(",") + ")");
      clause.push("bioAssays.originalPlatform.id in (" + platformIds.join(",") + ")");
    }
    if (searchSettings.technologyTypes.length > 0) {
      let technologyTypes = searchSettings.technologyTypes.filter(t => t !== "RNASEQ");
      // special case if searching exclusively for RNA-Seq
      if (searchSettings.technologyTypes.includes("RNASEQ")) {
        // if searching exclusively for RNA-Seq data, we can add an extra filter for correctness
        // only microarray platforms can be selected individually
        if (searchSettings.technologyTypes.length === 1 && searchSettings.platforms.length === 0) {
          filter.push(["bioAssays.originalPlatform.technologyType = SEQUENCING"]);
        }
        technologyTypes.push("GENELIST");
      }
      clause.push(
        "bioAssays.arrayDesignUsed.technologyType in (" + technologyTypes.join(",") + ")"
      );
    }
    filter.push(clause);
  }

  if (searchSettings.categories.length > 0) {
    // check if all categories are picked
    let categories = searchSettings.categories;
    if (categories.length > MAX_URIS_IN_CLAUSE) {
      console.warn(`Too many categories (${categories.length}) in clause, will only retain the first ${MAX_URIS_IN_CLAUSE} categories.`);
      categories = categories.slice(0, MAX_URIS_IN_CLAUSE);
    }
    if (categories.length > 0) {
      for (const category of categories) {
        if (category.classUri) {
          filter.push(["allCharacteristics.categoryUri = " + quoteIfNecessary(category.classUri)]);
        } else if (category.className) {
          filter.push(["allCharacteristics.category = " + quoteIfNecessary(category.className)]);
        } else {
          console.warn("Selection of the 'Uncategorized' category is not supported");
        }
      }
    }
  }
  if (searchSettings.annotations.length > 0) {
    let annotationByCategoryId = chain(searchSettings.annotations)
      .groupBy(getCategoryId)
      .value();
    for (const categoryId in annotationByCategoryId) {
      let categoryUri = annotationByCategoryId[categoryId].find(t => t.classUri !== null)?.classUri || null;
      let categoryName = annotationByCategoryId[categoryId].find(t => t.classUri === null)?.className || null;
      // FIXME: the category should be in a conjunction with the value, but that is not supported
      // add a clause for the category, this is not exactly correct
      if (categoryUri !== null) {
        filter.push(["allCharacteristics.categoryUri = " + quoteIfNecessary(categoryId)]);
      } else if (categoryName !== null) {
        filter.push(["allCharacteristics.category = " + quoteIfNecessary(categoryId)]);
      } else {
        console.warn("Selection of the 'Uncategorized' category is not supported.");
      }
      let termUris = annotationByCategoryId[categoryId]
        .filter(t => t.termUri !== null)
        .map(t => t.termUri);
      let termNames = annotationByCategoryId[categoryId]
        .filter(t => t.termName === null)
        .map(t => t.termName);
      let f = [];
      if (termUris.length > MAX_URIS_IN_CLAUSE) {
        console.warn(`Too many annotations (${termUris.length}) selected under ${categoryId}, will only retain the first ${MAX_URIS_IN_CLAUSE} terms.`);
        termUris = termUris.slice(0, MAX_URIS_IN_CLAUSE);
      }
      if (termUris.length > 0) {
        f.push("allCharacteristics.valueUri in (" + termUris.map(quoteIfNecessary).join(", ") + ")");
      }
      if (termNames.length > MAX_URIS_IN_CLAUSE) {
        console.warn(`Too many annotations (${termNames.length}) selected under ${categoryId}, will only retain the first${MAX_URIS_IN_CLAUSE} terms.`);
        termNames = termNames.slice(0, MAX_URIS_IN_CLAUSE);
      }
      if (termNames.length > 0) {
        f.push("allCharacteristics.value in (" + termNames.map(quoteIfNecessary).join(", ") + ")");
      }
      filter.push(f);
    }
  }
  let numberOfClauses = sumBy(filter, f => f.length);
  if (numberOfClauses > 100) {
    console.error("Too many clauses (" + numberOfClauses + ") in filter.");
    return [];
  }
  return filter;
}

/**
 * Generate a human-readable description for a search settings.
 * @param {SearchSettings} searchSettings
 * @returns {String}
 */
export function generateFilterSummary(searchSettings) {
  const filters = [];
  if (searchSettings.query) {
    filters.push("query");
  }
  if (searchSettings.taxon.length > 0) {
    filters.push("taxa");
  }
  if (searchSettings.platforms.length > 0 || searchSettings.technologyTypes.length > 0) {
    filters.push("platforms");
  }
  if (searchSettings.categories.length > 0 || searchSettings.annotations.length > 0) {
    filters.push("annotations");
  }
  if (filters.length > 0) {
    return "Filters applied: " + filters.join(", ");
  } else {
    return "";
  }
}

/**
 * Generate a human-readable description for a search settings.
 * @param {SearchSettings} searchSettings
 * @returns {String}
 */
export function generateFilterDescription(searchSettings) {
  const filter = [];
  if (searchSettings.query) {
    filter.push({ key: "Query ", value: `"${searchSettings.query}"` });
  }
  if (searchSettings.taxon.length > 0) {
    const taxaValues = searchSettings.taxon.map(taxon => taxon.commonName);
    filter.push({ key: "Taxa ", value: taxaValues.join(" OR ") });
  }
  if (searchSettings.platforms.length > 0 || searchSettings.technologyTypes.length > 0) {
    const platformValues = searchSettings.platforms.map(platforms => platforms.name);
    if (searchSettings.technologyTypes && searchSettings.technologyTypes.includes("RNASEQ")) {
      platformValues.unshift("RNA-Seq");
    }
    if (searchSettings.technologyTypes && searchSettings.technologyTypes.length >= 3 && searchSettings.platforms.length === 0) {
      platformValues.unshift("Microarray");
    }
    filter.push({ key: "Platforms ", value: platformValues });
  }
  if (searchSettings.categories.length > 0) {
    for (let cat of searchSettings.categories) {
      if (cat.className) {
        filter.push({ key: pluralize(cat.className), value: "ANY" });
      } else if (cat.classUri) {
        filter.push({ key: cat.classUri, value: "ANY" });
      } else {
        filter.push({ key: "Uncategorized", value: "ANY" });
      }
    }
  }
  if (searchSettings.annotations.length > 0) {
    const annotationGroups = searchSettings.annotations.reduce((acc, annotation) => {
      let { classUri, className, termName } = annotation;
      if (className) {
        className = pluralize(className);
      } else if (classUri) {
        className = classUri;
      } else {
        className = "Uncategorized";
      }
      if (!acc[className]) {
        acc[className + " "] = [termName];
      } else {
        acc[className].push(termName);
      }
      return acc;
    }, {});
    for (const className in annotationGroups) {
      filter.push({ key: className, value: annotationGroups[className] });
    }
  }
  if (filter.length > 0) {
    return filter.map(filter => {
      const { key, value } = filter;
      const capitalizedKey = capitalizeFirstLetter(key);

      if (Array.isArray(value)) {
        const capitalizedValues = value.map(capitalizeFirstLetter);
        return `${capitalizedKey}= ${capitalizedValues.join(" OR ")}`;
      } else {
        const capitalizedValue = capitalizeFirstLetter(value);
        return `${capitalizedKey}= ${capitalizedValue}`;
      }
    }).join("\n AND \n");
  } else {
    return "";
  }
}