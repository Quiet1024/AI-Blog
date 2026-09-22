<script setup lang="ts">
import { siteConfig } from '~/data/site'

const {
  public: { siteUrl },
} = useRuntimeConfig()

useHead({
  htmlAttrs: { lang: siteConfig.locale },
})

useSeoMeta({
  titleTemplate: `%s · ${siteConfig.name}`,
  description: siteConfig.description,
  ogType: 'website',
  ogSiteName: siteConfig.name,
  // OG / Twitter 图必须是绝对地址 —— 爬虫不会替你补全相对路径。
  // 用站点完整 URL 拼，顺带也就与部署子路径无关了。
  ogImage: `${siteUrl}/og-default.png`,
  twitterCard: 'summary_large_image',
  twitterImage: `${siteUrl}/og-default.png`,
})
</script>

<template>
  <NuxtRouteAnnouncer />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
