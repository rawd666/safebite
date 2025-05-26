import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  category?: string;
  rating?: number | null;
  isFeatured?: boolean;
  isFavorite?: boolean;
  onPress?: () => void;
  onToggleFavorite?: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  name,
  price,
  imageUrl,
  category,
  rating,
  isFeatured,
  isFavorite,
  onPress,
  onToggleFavorite,
}) => (
  <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
    <View style={styles.imageContainer}>
      <Image
        source={{ uri: imageUrl || 'https://placehold.co/600x400/EAF2FF/9FB0C7?text=N/A' }}
        style={styles.image}
        resizeMode="cover"
      />
      {isFeatured && (
        <View style={styles.featuredBadge}>
          <Ionicons name="star" size={10} color="#000000" style={{ marginRight: 4 }} />
          <Text style={styles.featuredBadgeText}>Featured</Text>
        </View>
      )}
      {onToggleFavorite && (
        <TouchableOpacity style={styles.favoriteButton} onPress={onToggleFavorite}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={22}
            color={isFavorite ? '#FF3B30' : '#FFFFFF'}
          />
        </TouchableOpacity>
      )}
    </View>
    <View style={styles.details}>
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      {category && <Text style={styles.category}>{category}</Text>}
      <View style={styles.footer}>
        <Text style={styles.price}>${price.toFixed(2)}</Text>
        {rating !== null && rating !== undefined && (
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={14} color="#FFC94D" />
            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        )}
      </View>
    </View>
    <View style={styles.buttonWrapper}>
      <TouchableOpacity
        style={styles.viewDetailsButton}
        onPress={onPress}
      >
        <Text style={styles.viewDetailsButtonText}>View Details</Text>
        <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{marginLeft: 6}}/>
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    borderRadius: 12,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  imageContainer: {
    height: 120,
    position: 'relative',
    backgroundColor: '#F0F4F8',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  featuredBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#E3E430',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  featuredBadgeText: {
    fontFamily: 'mediumFont',
    color: '#000000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  favoriteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(88, 88, 88, 0.3)',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  details: {
    paddingHorizontal: 15,
    paddingTop: 15,
  },
  name: {
    fontFamily: 'mediumFont',
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 3,
    minHeight: 34,
  },
  category: {
    fontFamily: 'bodyFont',
    fontSize: 11,
    color: '#718096',
    marginBottom: 5,
    textTransform: 'capitalize',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  price: {
    fontFamily: 'subtitleFont',
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4EA8DE',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontFamily: 'bodyFont',
    fontSize: 12,
    color: '#4A5568',
    marginLeft: 3,
    fontWeight: '500',
  },
  buttonWrapper: {
    paddingHorizontal: 10,
    paddingBottom: 15,
  },
  viewDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4EA8DE',
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 10,
  },
  viewDetailsButtonText: {
    fontFamily: 'subtitleFont',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});