import React from 'react';
import { View, Text } from 'react-native';
import { Theme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import { MePushPage } from './MePushPage';
import { space } from '../../design-system';

type LegalDocument = 'agreement' | 'privacy';

const DOCUMENTS: Record<LegalDocument, { intro: string; sections: { heading: string; paragraphs: string[] }[] }> = {
  agreement: {
    intro: '欢迎使用「开爬 kaipa」徒步记录服务。在注册或使用本服务前，请仔细阅读并充分理解本协议各条款。',
    sections: [
      { heading: '一、服务内容', paragraphs: ['开爬为徒步、登山等户外活动提供轨迹记录、路线规划、装备清单、行程相册与同行者协作等功能。'] },
      { heading: '二、账号注册与安全', paragraphs: ['你应对账号下的所有活动负责，并妥善保管登录凭证。如发现账号被未经授权使用，请及时联系我们。'] },
      { heading: '三、用户行为规范', paragraphs: ['你承诺不利用本服务从事违反法律法规或公序良俗的行为，不上传违法、侵权或虚假的内容。'] },
      { heading: '四、内容与知识产权', paragraphs: ['你对自己创作并上传的内容保留权利，同时授予开爬为提供和改进服务所必需的使用许可。'] },
      { heading: '五、户外安全免责声明', paragraphs: ['户外活动存在天气、地形、体能等固有风险。路线、海拔与里程数据仅供参考，你应根据自身能力审慎决策并自行负责安全。'] },
      { heading: '六、服务变更与终止', paragraphs: ['我们可能根据运营需要调整、暂停或终止部分功能。若你违反本协议，我们有权限制或终止服务。'] },
      { heading: '七、其他', paragraphs: ['本协议的解释与争议解决适用中华人民共和国法律。协议更新后将在应用内提示。'] },
    ],
  },
  privacy: {
    intro: '开爬 kaipa 高度重视你的隐私。本政策说明我们如何收集、使用、存储和保护你的个人信息。',
    sections: [
      { heading: '一、我们收集的信息', paragraphs: ['账号信息：手机号、邮箱、昵称与头像等你主动提供的资料。', '轨迹与位置信息：你上传或记录的徒步轨迹、海拔、里程等地理数据。', '内容信息：你在行程中添加的照片、文字与装备清单。'] },
      { heading: '二、信息的使用', paragraphs: ['用于实现轨迹记录、路线展示、行程相册与同行协作等核心功能，并保障账号与数据安全。'] },
      { heading: '三、信息的共享', paragraphs: ['当你分享或公开发布行程时，相应内容会按你的设置被对应用户看到。除法律要求或获得明确同意外，我们不会出售或出租个人信息。'] },
      { heading: '四、信息的存储与安全', paragraphs: ['我们采用加密传输与访问控制等措施保护你的数据，存储期限不超过实现目的所必需的时间。'] },
      { heading: '五、你的权利', paragraphs: ['你有权查询、更正或删除个人信息，也可注销账号，或关闭、撤回相关授权。'] },
      { heading: '六、第三方服务', paragraphs: ['登录或地图等功能可能由第三方提供，其对信息的处理适用其各自的隐私政策。'] },
      { heading: '七、联系我们', paragraphs: ['如对本政策有任何疑问或投诉，可通过应用内「帮助与反馈」联系我们。'] },
    ],
  },
};

export function LegalDocumentPage({ theme, document, onBack }: { theme: Theme; document: LegalDocument; onBack: () => void }) {
  const { t } = useI18n();
  const doc = DOCUMENTS[document];
  const title = document === 'agreement' ? t('account.about.terms') : t('account.about.privacy');
  return (
    <MePushPage theme={theme} title={title} onBack={onBack}>
      <View style={{ paddingHorizontal: space.xl }}>
        <Text style={{ fontSize: 12, color: theme.text3 }}>更新日期：2026 年 4 月 1 日</Text>
        <Text style={{ fontSize: 14, color: theme.text2, lineHeight: 24, marginTop: space.md }}>{doc.intro}</Text>
        {doc.sections.map((section) => (
          <View key={section.heading} style={{ marginTop: space.xxl }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text }}>{section.heading}</Text>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph} style={{ fontSize: 14, color: theme.text2, lineHeight: 24, marginTop: space.sm }}>{paragraph}</Text>
            ))}
          </View>
        ))}
      </View>
    </MePushPage>
  );
}
