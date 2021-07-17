const Axios = require('axios');
const XLSX = require('xlsx');
const puppeteer = require('puppeteer');
const fs = require('fs');
const getStream = require('get-stream');

const axios = Axios.create({
  baseURL: '',
  timeout: 30000,
});
// 请求拦截器
axios.interceptors.request.use(
  config => {
    return config;
  },
  error => {
    console.log('请求错误', error);
    return Promise.reject(error);
  },
);

// 响应拦截器
axios.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    console.log('响应错误' + error);
    return Promise.reject(error);
  },
);

(async () => {
  const baiduMapURL = 'https://lbsyun.baidu.com/index.php?title=open/dev-res';
  const browser = await puppeteer.launch({});

  const page = await browser.newPage();

  await page.goto(baiduMapURL);
  // 拿到arcode excel文件地址
  const xlsxUrlList = await page.evaluate(() => {
    return document
      .querySelector('body')
      .innerHTML.match(/https:\/\/mapopen-pub-webserviceapi.bj.bcebos.com\/geocoding\/.+\.xlsx/);
  });
  // 关闭浏览器
  browser.close();
  if (xlsxUrlList) {
    // 理论上应该只有一个
    const xlsxURL = xlsxUrlList[0];
    const response = await axios.get(xlsxURL, { responseType: 'stream' });
    // 将响应数据流转换成buffer
    const bufs = await getStream.buffer(response.data);

    // 将xlsx非第一行的数据转换成json
    const getJsonData = sheet => {
      const results = [];
      const symbalTable = ['name_prov', 'code_prov', 'name_city', 'code_city', 'name_coun', 'code_coun'];
      const range = XLSX.utils.decode_range(sheet['!ref']); // 获取表的有效范围
      // 行
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const item = {};
        // 所有列
        // for (let C = range.s.c; C <= range.e.c; ++C) {
        // 截取1-6列，剔除镇乡数据
        for (let C = range.s.c; C < symbalTable.length; ++C) {
          const cell = sheet[XLSX.utils.encode_cell({ c: C, r: R })];
          item[symbalTable[C]] = XLSX.utils.format_cell(cell);
        }
        results.push(item);
      }
      return results;
    };
    await new Promise((resolve, reject) => {
      const data = bufs;
      const workbook = XLSX.read(data, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      // 拿到json格式的arcode数据
      const jsonData = getJsonData(worksheet);
      // 去重
      const tempMap = {};
      for (let i = 0; i < jsonData.length; i++) {
        const element = jsonData[i];
        tempMap[element.code_coun] = element;
      }
      fs.writeFile('./areacode.json', JSON.stringify(Object.values(tempMap)), error => {
        if (error) {
          console.error(error);
        }
      });
      resolve();
    });
  }
})();
