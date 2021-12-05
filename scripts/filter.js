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
     * Renders a large number of rows in chunks so that it doesn't make the UI unresponsive for too long.
     * @param {Array} array
     * @param {Function} cb - A callback function that returns a table row
     * @param {Number} maxTimePerChunk - Time per chunk, in milliseconds
     * @param {Number} [index = 0] - Starts processing the array from here
     * @returns {Promise}
     */
    processLargeArray(array, cb, maxTimePerChunk = 100, index = 0) {
      function processChunk() {
        const startTime = Date.now();
        const fragment = new DocumentFragment();
        while (index < array.length && (Date.now() - startTime) <= maxTimePerChunk) {
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

    fetchTags() {
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

    getStorageData(key) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, (data) => {
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }
          resolve(data);
        });
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
     * @param {Object} params.adopts - All adoptables in a particular section; i.e. "I Need", "They Need", "Both Have"
     * @param {Array} [params.idsInTag = Object.keys(params.adopts)] - All adoptable IDs in the selected tag. If empty or undefined, then no tag was selected.
     * @param {Boolean} [params.mySparesChecked] - Check box value for "My collection - only spares and missing"
     * @param {Boolean} [params.theirSparesChecked] - Check box value for "Their collection - only spares and missing"
     * @returns {Promise}
     */
    getFilteredAdoptables({ adopts, idsInTag = [], mySparesChecked, theirSparesChecked }) {
      const processAllAdopts = idsInTag.length === 0 && !mySparesChecked && !theirSparesChecked;
      if (idsInTag.length === 0) {
        idsInTag = Object.keys(adopts);
      }

      return filterUtils.processLargeArray(idsInTag, (id, index, array) => {
        if (processAllAdopts) {
          return filterUtils.createTableRow(adopts[id]);
        }

        if (Object.hasOwnProperty.call(adopts, id)) {
          if (
            (mySparesChecked && theirSparesChecked && adopts[id].mine != 1 && adopts[id].theirs != 1)
            || (!mySparesChecked && !theirSparesChecked)
            || (!mySparesChecked && adopts[id].theirs != 1)
            || (!theirSparesChecked && adopts[id].mine != 1)
          ) {
            return filterUtils.createTableRow(adopts[id]);
          } else {
            return null;
          }
        }
      });
    },

    /**
     * @param {('iNeed'|'theyNeed'|'bothHave')} section
     */
    createTableHeading(section) {
      const text = CONSTANTS.messages[section];
      const id = CONSTANTS.ids[section];
      const el = document.createElement('tr');
      el.classList.add('headingRow');
      el.id = id;
      el.innerHTML = `<td colspan="3">${text}</td>`;
      CONSTANTS.elements.tableBody.appendChild(el);
    },

    clearTable() {
      function removeRows() {
        const startTime = Date.now();
        const maxTimePerChunk = 100;
        let rowCount = CONSTANTS.elements.tableBody.children.length;
        while (rowCount > 1 && (Date.now() - startTime) <= maxTimePerChunk) {
          CONSTANTS.elements.tableBody.removeChild(CONSTANTS.elements.tableBody.lastChild);
          rowCount--;
        }

        return new Promise((resolve) => {
          if (CONSTANTS.elements.tableBody.children.length > 1) {
            return setTimeout(() => resolve(removeRows(), 0));
          } else {
            return resolve();
          }
        });
      }

      return removeRows();
    },

    setLoaderVisibility(state) {
      const loader = document.querySelector('.filter-loader');
      if (state === 'show') {
        loader.classList.add('is-shown');
        document.querySelector('#filter-form [type="submit"]').disabled = true;
      } else if (state === 'hide') {
        loader.classList.remove('is-shown');
        document.querySelector('#filter-form [type="submit"]').disabled = false;
      }
    }
  };

  /* ========== Main code ========== */

  (function init() {
    // Get adoptable guide tags
    const p = filterUtils.getStorageData(['adoptableGuideTags', 'tagDataLastRefreshed'])
      .then((data) => {
        // Return another promise to return the resolved value to the .then() in the chain
        return new Promise((resolve, reject) => {
          const expirationDuration = 1000 * 60 * 60 * 24 * 14; // 14 days
          const currentTime = Date.now();
          const refreshData = currentTime - data.tagDataLastRefreshed > expirationDuration;
          if (!data.adoptableGuideTags || refreshData) {
            filterUtils.fetchTags().then((tags) => {
              chrome.storage.local.set({ 'adoptableGuideTags': tags });
              chrome.storage.local.set({ 'tagDataLastRefreshed': currentTime });
              resolve(tags);
            });
          } else {
            resolve(data.adoptableGuideTags);
          }
        });
      });

    // Append form elements to page
    const filterWrapper = document.createElement('div');
    filterWrapper.id = 'collection-filter';
    filterWrapper.innerHTML = `
      <style>
        #filter-form {
          display: inline-block;
          margin: 1rem;
          text-align: center;
        }
        #filter-form * {
          margin-bottom: 4px;
        }
        #filter-form label {
          display: block;
        }
        .filter-loader {
          background-color: #eee;
          height: 8px;
          margin-top: 8px;
          overflow: hidden;
          position: relative;
          visibility: hidden;
        }
        .filter-loader.is-shown {
          visibility: visible;
        }
        .filter-loader__foreground {
          animation: loading 1.2s ease-in-out forwards infinite;
          animation-play-state: paused;
          border-left: 24px solid #00bcd4;
          height: 100%;
          position: absolute;
          width: 100%;
        }
        .filter-loader.is-shown > .filter-loader__foreground {
          animation-play-state: running;
        }
        @keyframes loading {
          0% {
            transform: translateX(-24px);
          }
          100% {
            transform: translateX(100%);
          }
        }       
      </style>
      <form id="filter-form">
        <label>Filter by tag: <select name="tag"><option value=""></option></select></label>
        <label>My collection - only spares and missing: <input type="checkbox" name="my-spares-only"/></label>
        <label>Their collection - only spares and missing: <input type="checkbox" name="their-spares-only"/></label>
        <button type="submit" value="Filter" class="filter-submit" />
          Filter
        </button>
        <div class="filter-loader"><div class="filter-loader__foreground"></div></div>
      </form>
    `;
    document.querySelector('#megaContent center').insertBefore(filterWrapper, document.querySelector('.niceTable'));

    p.then((tags) => {
      // Append tags to dropdown
      const fragment = new DocumentFragment();
      tags.forEach((tag) => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        fragment.appendChild(option);
      });
      document.querySelector('#filter-form [name="tag"]').appendChild(fragment);
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
    document.querySelector('#filter-form').addEventListener('submit', (e) => {
      e.preventDefault();
      filterUtils.setLoaderVisibility('show');

      // Defer all the stuff in here to give the loader a chance to appear on the page first
      setTimeout(async () => {
        const adoptableData = filterData.adoptables;
        const filterFormData = new FormData(document.querySelector('#filter-form'));
        const tag = filterFormData.get('tag');
        const mySparesChecked = filterFormData.get('my-spares-only');
        const theirSparesChecked = filterFormData.get('their-spares-only');

        let idsInTag;
        const p1 = filterUtils.clearTable();
        let p2;
        if (filterData.lastSelectedTag.tag === tag) {
          // Use cached data
          idsInTag = filterData.lastSelectedTag.ids;
          p2 = idsInTag;
        } else if (tag) {
          // Fetch tag IDs
          p2 = filterUtils.getIdsInTag(tag);
          idsInTag = await p2;
          filterData.lastSelectedTag.tag = tag;
          filterData.lastSelectedTag.ids = idsInTag;
        }

        // Wait for p1 and p2 to finish before rendering the table
        await Promise.all([p1, p2]);

        const createASection = (section) => {
          filterUtils.createTableHeading([section]);
          return filterUtils.getFilteredAdoptables({
            adopts: adoptableData[section],
            idsInTag,
            mySparesChecked,
            theirSparesChecked
          });
        };

        await createASection('iNeed');
        await createASection('theyNeed');
        await createASection('bothHave');

        filterUtils.setLoaderVisibility('hide');
      }, 0);
    });
  })();
});
