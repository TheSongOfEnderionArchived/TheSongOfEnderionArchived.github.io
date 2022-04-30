/*jshint esversion: 9 */

var areas = ['spoiler', 'nonspoiler'];
var pageName = '';
var idList = [];

function startPage() {
  const app = Vue.createApp({
    data() {
      return {
        meta: {},
        dir: {},
        headerNavBtn: {},

        // Project Variables
        projectTitle: '',
        projectSubtitle: '',


        // Page Variables
        pageData: {},
        pageTitle: '',
        pageContents: {
          spoiler: [],
          nonspoiler: []
        },

        // Others
        areaToggle: getSpoilerStorageValue(),
        editorData: {},
      };
    },
    methods: {
      areaToggleHandler(checked) {
        this.areaToggle = checked;
      },
      getPageUrl() {
        if (window.location.search) {
          let urlParams = new URLSearchParams(window.location.search);
          let url = urlParams.get('p').replace(/\s/g, "-");
          if (url) url.trim();
          return url;
        } else {
          return 'home';
        }

      }
    },
    async mounted() {
      // Step 1. Retrieves Necessary Files
      const metaRes = await fetch(`.eternal/eternal.json`); // Get Metadata
      this.meta = await metaRes.json();

      const dirRes = await fetch(`.eternal/directory.json`); // Get Directory
      this.dir = await dirRes.json();

      // Step 2. Gets Page URL
      pageName = this.getPageUrl();
      if (!this.dir.hasOwnProperty(pageName)) {
        // Step 2.5 Return something if page does not exist.
        return;
      }

      await renderPage(this, this.dir[pageName].path);


    }
  });

  // Register Components
  app.component(btn.name, btn);
  app.component(header.name, header);
  app.component(pageContent.name, pageContent);
  app.component(tab.name, tab);
  app.component(toggle.name, toggle);
  app.component(breadcrumbs.name, breadcrumbs);
  app.component(profilebox.name, profilebox);
  app.component(tabs.name, tabs);

  app.component(editor.name, editor);
  app.component(contentEditor.name, contentEditor);
  app.component(textInput.name, textInput);
  app.component(markdown.name, markdown);
  // Mount
  app.mount('#app');
}


async function renderPage(mainApp, url) {

    // Step 3. Gets Page HTML
    const pageFile = await fetch(url);
    let html = await pageFile.text();

    let pageRaw = html.trim().split("<!-- File Content -->");


    // Step 4. Processing Window Variables
    loadScripts(pageRaw[0]);


    // Step 5. Set Page General Data
    mainApp.headerNavBtn = mainApp.meta.headerNavigation;
    mainApp.projectTitle = mainApp.meta.projectTitle;
    mainApp.projectSubtitle = mainApp.meta.projectSubtitle;


    // Step 6. Set Page Specific Data
    mainApp.pageData = window.pageData;
    mainApp.pageTitle = window.pageData.title;
    mainApp.pageParent = window.pageData.parent;

    let editorContentDataTemp = {};    
    

    // Step 7. Process Contents
    const parsedContent = parseHTML(pageRaw[1]);
    let content = []; // Separating Each Part
    for (const area of areas) {
      let areaDiv = parsedContent.getElementById(area);
      if (!areaDiv) continue;
      for (let item of areaDiv.querySelectorAll('.page-tab')) {
        let itemHtml = superTrim(item.innerHTML);
        editorContentDataTemp[item.id] = itemHtml;
        content.push(`<div id="${item.id}" class="page-tag">\n` + itemHtml + "\n</div>");
      }
    }

    const textRenderer = new TextRenderer(mainApp.dir);

    // Step 8. Add Contents to render
    content.forEach((item, index) => { // Adding them to the tab
      let data = getPageData(item);
      let profileBox = {};
      if (window.profileData.hasOwnProperty(data.data.id)) {
        profileBox = window.profileData[data.data.id];
      }
      mainApp.pageContents[data.type].push({ html: textRenderer.renderText(item, data.type), profileBox: profileBox, ...data.data });
    });

    

    let editorDataTemp = { pageData: window.pageData, profileData: window.profileData, contentData: JSON.parse(JSON.stringify(mainApp.pageContents))};
    for (const area in editorDataTemp.contentData) {
      for (const item of editorDataTemp.contentData[area]) {
        item.html = editorContentDataTemp[item.id];
        delete item.profileBox;
      }
    }
    
    mainApp.editorData = editorDataTemp;
    console.log(mainApp.editorData);
  }

function getPageData(html) {
  const id = html.match(/<div id=\"(.+?)\"/)[1];

  return {
    type: window.pageData.tabs[id].area,
    data: {
      id: id,
      pageid: id + '-page',
      name: window.pageData.tabs[id].name
    }
  };
}

function getSpoilerStorageValue() {
  if (localStorage.theSongOfEnderion_isSpoiler === 'true') return true;
  else return false;
}


/**
 * Parse HTML String.
 *
 * Parses an HTML string into a Node object.
 *
 * @access     public
 * @param {string}   html   html string.
 * @return {Node}  a node with the parsed html string.
 */
function parseHTML(html) {
  let t = document.createElement('template');
  t.innerHTML = html;
  return t.content.cloneNode(true);
}


/**
 * Load Page HTML Script Variables.
 *
 * Parses the string \<script\> tag of the page html and
 * evaluates it so you can use its vars and funcs.
 *
 * @access     private
 * @param {string}   scriptData  string of the \<script\> 
 */
function loadScripts(scriptData) {
  let parsedData = parseHTML(scriptData);

  let scripts = parsedData.querySelectorAll("script");
  for (let script of scripts) {
    if (script.innerText) {
      eval(script.innerText); // jshint ignore:line
    } else if (script.src) {
      fetch(script.src).then(data => {
        data.text().then(r => {
          eval(r); // jshint ignore:line
        });
      });
    }
    // To not repeat the element
    script.parentNode.removeChild(script);
  }
}



function superTrim(text) {
  let content = text.trim().split("\n");
  let result = "";
  for (let con of content) {
    result += `${con.trim()}\n`;
  }
  return result;
}




class TextRenderer {
  constructor(dir) {
    this.headerConvertionTable = {
      '# ': 'h1',
      '## ': 'h2',
      '### ': 'h3',
      '#### ': 'h4',
      '##### ': 'h5',
      '###### ': 'h6',
    };
    this.renderTOC = false;
    this.TOClist = {};
    this.dir = dir;
  }

  /**
   * Render Markdown Text
   *
   * Parses the markdown content of the html string and
   * applies markdown rules as well as custom rendering.
   *
   * @access     public
   * @param {string}   htmlContentString   raw string content of the html
   */
  renderText(htmlContentString, area) {
    if (htmlContentString.includes("[[toc]]")) {
      this.renderTOC = true;
    }
    // let remove = html.match(/<\/div>([\s\S]*?)<div id="spoiler">/gm);
    // let htmlContentString = html.replace(remove[0], `</div>\n<div id="spoiler">`);
    const lines = htmlContentString.trim().split("\n");

    let htmlContent = '';

    for (const line of lines) {
      let value = line.trim();
      if (value == "") {
        htmlContent += '<p class="space"></p>';
        continue;
      }
      // Formats
      value = this.renderWordBold(value);
      value = this.renderWordItalic(value);

      // List
      if (value.startsWith("* ")) {
        htmlContent += `<li>${value.replace("* ", "").trim()}</li>\n`;
        continue;
      }

      // Headers
      const hres = value.match(/(#+)\s/);
      if (hres) {
        let h = this.headerConvertionTable[hres[0]];
        if (this.renderTOC) {
          let value_ = value.replace(hres[0], "");
          let id = `${area}-${value_.replace(/\s/g, "-").toLowerCase()}`;
          if (idList.includes(id)) {
            id += makeid(5);
          }
          htmlContent += `<${h} id="${id}" class="h">${value_} <a href="#" class="arrow-up">↑</a></${h}>\n`;
          this.TOClist[value_] = { id: id, h: h.toUpperCase() };
        } else {
          htmlContent += `<${h} class="h">${value.replace(hres[0], "")}</${h}>\n`;
        }

        if (h == "h1") htmlContent += '<hr>\n';
        continue;
      }


      // Link
      let links = value.match(/\[\[(.*?)\]\]/g);
      if (links) {
        for (const link of links) {
          if (link === '[[toc]]') continue;
          let linkName = link.trim().replace(/(\[|\])/g, '');
          
          // // Search Directly
          let linkNameLowered = linkName.toLowerCase();
          if (this.dir.hasOwnProperty(linkNameLowered)) {
            let dirItem = this.dir[linkNameLowered];
            value = value.replace(link, `<a href="${dirItem.path}}">${dirItem.title}</a>`);
            continue;
          }

          // // Search Indirectly
          for (const pageName in this.dir) {
            let dirItem = this.dir[pageName];
            if (dirItem.title.toLowerCase() === linkNameLowered) {
              value = value.replace(link, `<a href="${dirItem.path}}">${dirItem.title}</a>`);
              break;
            }
          }
        }
      }

      // Add Value
      htmlContent += value;
    }



    let toc = `
      <p class="font--small"><b>Table of Contents</b></p>
    `;

    for (const head in this.TOClist) {
      toc += `\n<a href="#${this.TOClist[head].id}" class="toc-${this.TOClist[head].h} btn-primary btn--color-secondary">${head}</a><br>`;
    }

    htmlContent = htmlContent.replace("[[toc]]", `<div class="toc">${toc}</div>`);
    this.renderTOC = false;
    this.TOClist = {};
    return htmlContent;
  }

  /**
   * Render Bold Words.
   *
   * Renders words containing ** {word} ** and turns it into a
   * bold html tag.
   *
   * @access     public
   * @param {string}   value   word to check if it has a bold format.
   * @return {string}  `<b>${content}</b>`
   */
  renderWordBold(value) {
    const bold_words = value.match(/\*\*(.*?)\*\*/g);
    const bold_words2 = value.match(/\_\_(.*?)\_\_/g);
    if (bold_words) {
      for (const word of bold_words) {
        value = value.replace(word, `<b>${word.replace(/\*/g, "").trim()}</b>`);
      }
    }
    if (bold_words2) {
      for (const word of bold_words2) {
        value = value.replace(word, `<b>${word.replace(/\_/g, "").trim()}</b>`);
      }
    }
    return value;
  }

  /**
   * Render Italic Words.
   *
   * Renders words containing * {word} * and turns it into an
   * italicized html tag.
   *
   * @access     public
   * @param {string}   value   word to check if it has a bold format.
   * @return {string}  `<b>${content}</b>`
   */
  renderWordItalic(value) {
    const italic_words = value.match(/\*(.*?)\*/g);
    if (italic_words) {
      for (const word of italic_words) {
        if (word == "**") continue;
        value = value.replace(word, `<i>${word.replace(/\*/g, "").trim()}</i>`);
      }
    }
    const italic_words2 = value.match(/\_(.*?)\_/g);
    if (italic_words2) {
      for (const word of italic_words2) {
        if (word == "**") continue;
        value = value.replace(word, `<i>${word.replace(/\_/g, "").trim()}</i>`);
      }
    }
    return value;
  }

}


/**
 * Generate Random String ID.
 *
 * Creates a randomly generated id string. it checks \[idList\] var
 * if the string already exists, if so, it regenerates it.
 *
 * @access     public
 * @param {int}   length   length of random id string
 * @return {string}  randomly generated id string
 */
function makeid(length) {
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let charactersLength = characters.length;
  while (true) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    if (idList.includes(result)) continue;
    idList.push(result);
    return result;
  }
}