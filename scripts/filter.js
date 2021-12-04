'use strict';
window.addEventListener('DOMContentLoaded', function () {
  const filterData = {
    adoptables: {
      iNeed: {},
      theyNeed: {},
      bothHave: {}
    },
    lastSelectedTag: {
      tag: '',
      ids: []
    }
  };

  const CONSTANTS = {
    elements: {
      tableBody: document.querySelector('.niceTable tbody'),
      iNeedHeading: document.querySelectorAll('.niceTable .headingRow')[1],
      theyNeedHeading: document.querySelectorAll('.niceTable .headingRow')[2],
      bothHaveHeading: document.querySelectorAll('.niceTable .headingRow')[3]
    },
    ids: {
      iNeed: 'themnotme',
      theyNeed: 'menotthem',
      bothHave: 'bothhave'
    },
    messages: {
      iNeed: 'Adoptables you need',
      theyNeed: 'Adoptables they need',
      bothHave: 'Adoptables you both have'
    }
  };

  /* ========== Utility functions ========== */

  const filterUtils = {
    /**
     * Processes a large array in chunks so that it doesn't make the UI unresponsive.
     * @param {Array} array
     * @param {Function} cb - A callback function that returns a table row
     * @param {Number} [index = 0] - Starts processing the array from here
     * @returns {Promise}
     */
    processLargeArray(array, cb, index = 0) {
      function processChunk() {
        const maxChunkSize = 100;
        const chunk = Math.min(array.length, index + maxChunkSize);
        const fragment = new DocumentFragment();
        while (index < chunk) {
          const row = cb(array[index], index, array);
          row && fragment.appendChild(row);
          index++;
        }
        CONSTANTS.elements.tableBody.appendChild(fragment);

        return new Promise((resolve) => {
          if (index < array.length) {
            // Do next chunk
            return setTimeout(() => resolve(processChunk(), 0));
          } else {
            // Number of rows processed
            return resolve(index);
          }
        });
      }
      return processChunk();
    },

    getTags() {
      return fetch('./adoptable_guide.php')
        .then((res) => res.text())
        .then((text) => {
          const parser = new DOMParser();
          const tags = Array.from(parser.parseFromString(text, 'text/html').body
            .querySelectorAll('a[href*="/adoptable_guide.php?tag="]'))
            .map((link) => link.textContent);
          return tags;
        });
    },

    getIdsInTag(tag) {
      return fetch(`./adoptable_guide.php?tag=${tag}`)
        .then((res) => res.text())
        .then((text) => {
          const parser = new DOMParser();
          const idsInTag = Array.from(parser.parseFromString(text, 'text/html').body
            .querySelectorAll('a[href*="/adoptable_guide.php?id="]'))
            .map((link) => link.href.match(/\d+/)[0]);
          return idsInTag;
        });
    },

    /**
     * Processes all data rows for a single table section, i.e. "You need", "They need", "You both have".
     * @param {Object} destination - Where the processed data will be appended
     * @param {Node} startingHeading - Rows after this heading row will be processed
     */
    processAdoptableRows(destination, startingHeading) {
      const destCopy = { ...destination };
      let row = startingHeading.nextElementSibling;

      while (row !== null && !row.matches('.headingRow')) {
        const [col1, col2, col3] = [...row.children];
        const idSeparatorIndex = col1.textContent.indexOf('.');
        const adoptableId = col1.textContent.slice(0, idSeparatorIndex);

        const obj = {
          id: adoptableId,
          name: col1.textContent.slice(idSeparatorIndex + 2).trim(),
          mine: col2.textContent.trim() || 0,
          theirs: col3.textContent.trim() || 0
        };

        destCopy[adoptableId] = obj;
        row = row.nextElementSibling;
      }
      return destCopy;
    },

    /**
     * Creates a <tr> element with the provided adoptable object.
     * @param {Object} adoptable
     * @returns {Node}
     */
    createTableRow(adoptable) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="text-align: left;">${adoptable.id}. ${adoptable.name}<a href="https://www.clickcritters.com/adoptable_guide.php?id=${adoptable.id}"><img src="https://www.clickcritters.com/images/magnify.png"></a></td>
        <td>
          <a href="https://www.clickcritters.com/youradoptables.php?act=collection&amp;id=${filterData.myId}&amp;typeid=${adoptable.id}">${adoptable.mine} <img src="https://www.clickcritters.com/images/alertbox_${adoptable.mine ? 'green' : 'red'}.png" height="15"></a>
        </td>
        <td>
          <a href="https://www.clickcritters.com/youradoptables.php?act=collection&amp;id=${filterData.theirId}&amp;typeid=${adoptable.id}">${adoptable.theirs} <img src="https://www.clickcritters.com/images/alertbox_${adoptable.theirs ? 'green' : 'red'}.png" height="15"></a>
        </td>
      `;
      return row;
    },

    /**
     * Goes through a list of adoptables and returns the HTML based on the selected options.
     * @param {Object} params
     * @param {Array} params.idsInTag - All adoptable IDs in the selected tag
     * @param {Object} params.collection - All adoptables in a particular section; i.e. "I Need", "They Need", "Both Have"
     * @param {Boolean} params.mySparesChecked - Check box value for "My collection - only spares and missing"
     * @param {Boolean} params.theirSparesChecked - Check box value for "Their collection - only spares and missing"
     * @returns {Promise}
     */
    getFilteredAdoptables({ idsInTag, collection, mySparesChecked, theirSparesChecked }) {
      return filterUtils.processLargeArray(idsInTag, (id, index, array) => {
        if (Object.hasOwnProperty.call(collection, id)) {
          if (
            (mySparesChecked && theirSparesChecked && collection[id].mine != 1 && collection[id].theirs != 1)
            || (!mySparesChecked && !theirSparesChecked)
            || (!mySparesChecked && collection[id].theirs != 1)
            || (!theirSparesChecked && collection[id].mine != 1)
          ) {
            return filterUtils.createTableRow(collection[id]);
          } else {
            return null;
          }
        }
      });
    },

    createTableHeading(text, id) {
      const el = document.createElement('tr');
      el.classList.add('headingRow');
      el.id = id;
      el.innerHTML = `<td colspan="3">${text}</td>`;
      return el;
    },

    clearTable() {
      while (CONSTANTS.elements.tableBody.children.length > 1) { // Don't remove first heading row
        CONSTANTS.elements.tableBody.removeChild(CONSTANTS.elements.tableBody.lastChild);
      }
    },

    async clearFilter() {
      const adoptableData = filterData.adoptables;
      const loadRows = (data) => {
        const keys = Object.keys(data);
        return filterUtils.processLargeArray(keys, (adoptId, index) => filterUtils.createTableRow(data[adoptId]));
      };

      filterUtils.clearTable();
      CONSTANTS.elements.tableBody.appendChild(filterUtils.createTableHeading(CONSTANTS.messages.iNeed, CONSTANTS.ids.iNeed));
      await loadRows(adoptableData.iNeed);
      CONSTANTS.elements.tableBody.appendChild(filterUtils.createTableHeading(CONSTANTS.messages.theyNeed, CONSTANTS.ids.theyNeed));
      await loadRows(adoptableData.theyNeed);
      CONSTANTS.elements.tableBody.appendChild(filterUtils.createTableHeading(CONSTANTS.messages.bothHave, CONSTANTS.ids.bothHave));
      return loadRows(adoptableData.bothHave); // Returns a promise
    },

    addLoader() {
      const loader = document.createElement('div');
      loader.classList.add('loader');
      loader.style.display = 'none';
      loader.innerHTML = `<style>
        .loader {
          background-color: rgba(0, 0, 0, .7);
          display: inline-block;
          left: 50%;
          position: fixed;
          top: 50%;
          z-index: 100;
        }
        .loader::after {
          content: "";
          display: block;
          width: 48px;
          height: 48px;
          margin: 8px;
          border-radius: 50%;
          border: 6px solid #fff;
          border-color: #fff transparent #fff transparent;
          animation: lds-dual-ring 1.2s linear infinite;
        }
        @keyframes lds-dual-ring {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
        </style>`;
      document.body.appendChild(loader);
    },

    showLoader() {
      document.querySelector('.loader').style.display = 'block';
    },

    hideLoader() {
      document.querySelector('.loader').style.display = 'none';
    }
  };

  /* ========== Main code ========== */

  (function init() {
    // Append form elements to page
    const filterWrapper = document.createElement('div');
    filterWrapper.id = 'collection-filter';
    filterWrapper.innerHTML = `
      <form id="filter-form">
      <label style="display:block;">Filter by tag: <select name="tag"><option value=""></option></select></label>
      <label style="display:block;">My collection - only spares and missing: <input type="checkbox" name="my-spares-only"/></label>
      <label style="display:block;">Their collection - only spares and missing: <input type="checkbox" name="their-spares-only"/></label>
      <input type="submit" value="Filter" />
      </form>`;
    filterWrapper.style.margin = '1rem';
    document.querySelector('#megaContent center').insertBefore(filterWrapper, document.querySelector('.niceTable'));
    // Append loader
    filterUtils.addLoader();

    const p = new Promise((resolve) => {
      // Get adoptable guide tags
      if (localStorage.getItem('adoptableGuideTags') === null) {
        filterUtils.getTags().then((tags) => {
          localStorage.setItem('adoptableGuideTags', JSON.stringify(tags));
          resolve();
        });
      } else {
        resolve();
      }
    });

    p.then(() => {
      // Append tags to dropdown
      const tagsFragment = new DocumentFragment();
      JSON.parse(localStorage.getItem('adoptableGuideTags')).forEach((tag) => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagsFragment.appendChild(option);
      });
      document.querySelector('#filter-form [name="tag"]').appendChild(tagsFragment);
    });

    // Get user IDs being compared
    const myCollectionQueryParams = new URL(document.querySelector('.niceTable tr > td:nth-child(2) > a').href).searchParams;
    const theirCollectionQueryParams = new URL(document.querySelector('.niceTable tr > td:nth-child(3) > a').href).searchParams;
    filterData.myId = myCollectionQueryParams.get('id');
    filterData.theirId = theirCollectionQueryParams.get('id');

    // Construct JS object out of the table
    filterData.adoptables.iNeed = filterUtils.processAdoptableRows(filterData.adoptables.iNeed, CONSTANTS.elements.iNeedHeading);
    filterData.adoptables.theyNeed = filterUtils.processAdoptableRows(filterData.adoptables.theyNeed, CONSTANTS.elements.theyNeedHeading);
    filterData.adoptables.bothHave = filterUtils.processAdoptableRows(filterData.adoptables.bothHave, CONSTANTS.elements.bothHaveHeading);

    // Form submit handler
    document.querySelector('#filter-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const adoptableData = filterData.adoptables;
      const filterFormData = new FormData(document.querySelector('#filter-form'));
      const tag = filterFormData.get('tag');
      const mySparesChecked = filterFormData.get('my-spares-only');
      const theirSparesChecked = filterFormData.get('their-spares-only');

      if (!tag) {
        // Empty tag selected, so reset table to display all adopts
        filterUtils.showLoader();
        await filterUtils.clearFilter();
        filterUtils.hideLoader();
      } else {
        // Tag selected, so display only the adopts that are in the tag
        let idsInTag;
        filterUtils.showLoader();
        filterUtils.clearTable();
        // Fetching adoptable IDs in the tag, or re-using cached data
        if (filterData.lastSelectedTag.tag === tag) {
          idsInTag = filterData.lastSelectedTag.ids;
        } else {
          idsInTag = await filterUtils.getIdsInTag(tag);
          filterData.lastSelectedTag.tag = tag;
          filterData.lastSelectedTag.ids = idsInTag;
        }

        // Building "Adoptables you need" section
        CONSTANTS.elements.tableBody.appendChild(filterUtils.createTableHeading(CONSTANTS.messages.iNeed, CONSTANTS.ids.iNeed));
        await filterUtils.getFilteredAdoptables({
          idsInTag,
          collection: adoptableData.iNeed,
          mySparesChecked,
          theirSparesChecked
        });
        // Building "Adoptables they need" section
        CONSTANTS.elements.tableBody.appendChild(filterUtils.createTableHeading(CONSTANTS.messages.theyNeed, CONSTANTS.ids.theyNeed));
        await filterUtils.getFilteredAdoptables({
          idsInTag,
          collection: adoptableData.theyNeed,
          mySparesChecked,
          theirSparesChecked
        });
        // Building "Adoptables you both have" section
        CONSTANTS.elements.tableBody.appendChild(filterUtils.createTableHeading(CONSTANTS.messages.bothHave, CONSTANTS.ids.bothHave));
        await filterUtils.getFilteredAdoptables({
          idsInTag,
          collection: adoptableData.bothHave,
          mySparesChecked,
          theirSparesChecked
        });

        filterUtils.hideLoader();
      }
    });
  })();
});
