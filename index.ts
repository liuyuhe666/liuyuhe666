import { readFile, rm, writeFile } from 'fs/promises';
import { motto, timeZone, Blog } from './config';
import { COMMNETS } from './constants';
import dayjs from 'dayjs';
import MarkdownIt from 'markdown-it';
import { minify } from 'html-minifier';
import axios from 'axios';
import * as rax from 'retry-axios'

rax.attach();
axios.defaults.raxConfig = {
  retry: 5,
  retryDelay: 4000,
  onRetryAttempt: (err) => {
    const cfg = rax.getConfig(err)
    console.log('request: \n', err.request)
    console.log(`Retry attempt #${cfg.currentRetryAttempt}`)
  },
};

const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36';
axios.defaults.headers.common['User-Agent'] = userAgent;

const client = axios.create({
    baseURL: '',
    timeout: 4000,
});

client.interceptors.response.use(undefined, (err) => {
    console.log(err.message);
    return Promise.reject(err);
});

const md = new MarkdownIt({
    html: true,
});

function gc(token: keyof typeof COMMNETS) {
    return `<!-- ${COMMNETS[token]} -->`;
}

function m(html: TemplateStringsArray, ...args: any[]) {
    const str = html.reduce((s, h, i) => s + h + (args[i] ?? ''), '')
    return minify(str, {
      removeAttributeQuotes: true,
      removeEmptyAttributes: true,
      removeTagWhitespace: true,
      collapseWhitespace: true,
    }).trim()
}

type PostModel = {
    title: string,
    slug: string,
    summary: string,
    created: string
}

function generatePostItemHTML<T extends Partial<PostModel>>(item: T) {
    return m`<li><span>${dayjs(item.created).format('DD/MM/YYYY')} -  <a href="${
        Blog.url + '/' + item.slug
    }">${item.title}</a></span></li>`
}

async function main() {
    const template = await readFile('./README.template.md', { encoding: 'utf-8' });
    let newContent = template;

    // 注入 post
    {
        const data: any = await client.get(Blog.postUrl).then((data) => data.data);
        const postList: Array<any> = data.list;
        const posts = postList.slice(0, 5).reduce((acc, cur) => { 
            const post: PostModel = {
                title: cur.metadata.content.title,
                slug: cur.metadata.content.slug,
                summary: cur.metadata.content.summary,
                created: cur.createAt
            };
            return acc.concat(generatePostItemHTML(post));
        }, '');
        newContent = newContent.replace(
            gc('RECENT_POSTS'),
            m`
            <ul>
                ${posts}
            </ul>
            `,
          )
    }

    // 注入 FOOTER
    {
        const now = new Date()
        const next = dayjs().add(24, 'h').toDate()

        newContent = newContent.replace(
            gc('FOOTER'),
            m`
                <p align="center">此文件 <i>README</i> <b>间隔 24 小时</b>自动刷新生成！
                </br>
                刷新于：${now.toLocaleString(undefined, {
                timeStyle: 'short',
                dateStyle: 'short',
                timeZone,
                })}
                <br/>
                下一次刷新：${next.toLocaleString(undefined, {
                timeStyle: 'short',
                dateStyle: 'short',
                timeZone,
                })}</p>
            `,
        )
    }

    newContent = newContent.replace(gc('MOTTO'), motto)
    await rm('./README.md', { force: true })
    await writeFile('./README.md', newContent, { encoding: 'utf-8' })

    const result = md.render(newContent)
    await writeFile('./index.html', result, { encoding: 'utf-8' })
}

main();